// 引入所需的库和模块
const express = require('express');
const app = express();
const path = require('path');
const { Level } = require('level');
const fs = require("fs");
const pino = require('pino');
const Web3 = require('web3');
const mysql = require('mysql'); // 使用mysql2模块

// 获取合约ABI和字节码
const VotingSystemContract = require('./build/contracts/VotingSystem.json');
const contractABI = VotingSystemContract.abi;
const contractBytecode = VotingSystemContract.bytecode;

// 打开或创建leveldb数据库
    const db = new Level('ethereum', { valueEncoding: 'json' })
// 连接到以太坊网络
const web3 = new Web3('http://localhost:7545');

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 流日志
const stream = fs.createWriteStream("./log.txt", { flags: 'a' });
const logger = pino(stream);

// 使用 express.urlencoded() 中间件解析表单数据
app.use(express.urlencoded({ extended: true }));

// 使用 express.json() 中间件解析 JSON 数据
app.use(express.json());

// 创建MySQL连接池
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'panzhixin',
    database: 'blockvote'
});
  
// 存储区块信息到数据库
async function saveBlockData(blockData) {
    await db.put(blockData.blockHash, blockData);
}

// 根据区块哈希检索区块信息
async function getBlockData(blockHash) {
    return await db.get(blockHash);
}

// 将MySQL连接池添加到Express应用程序的本地变量中
app.locals.pool = pool;

// 插入数据到 ballots 表
function insertDataIntoBallots(creatorAddress, contractAddress, voteTitle, deadline) {
    // 构建插入语句
    const sql = `INSERT INTO ballots (creator_address, contract_address, vote_title, deadline) VALUES (?, ?, ?, ?)`;

    // 使用连接池执行插入操作
    pool.query(sql, [creatorAddress, contractAddress, voteTitle, deadline], (error, results, fields) => {
        if (error) {
            logger.error({
                errorMessage: error.message,
                stackTrace: error.stack
            });
            return;
        }
    });
}

// 插入历史合约数据的函数
function insertHistoryContract(contractAddress, voterAddress, voteTitle, deadline, userChoice) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err);
                return;
            }

            const query = 'INSERT INTO history_contracts (contract_address, voter_address, vote_title, deadline, user_choice, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
            connection.query(query, [contractAddress, voterAddress, voteTitle, deadline, userChoice], (error, results) => {
                connection.release();
                if (error) {
                    reject(error);
                    return;
                }
                resolve(results);
            });
        });
    });
}
  
// 在应用程序关闭时关闭数据库连接
process.on('SIGINT', () => {
  pool.end((err) => {
    if (err) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        process.exit(1);
    }
    console.log('程序关闭，成功关闭数据库连接');
    logger.info('program broken (CTRL + C)');
    process.exit(0);
  });
});

// 创建 POST 路由处理前端提交的表单数据
app.post('/createVote', async (req, res) => {
    // 从请求体中提取表单数据
    const formData = req.body;
    const metaMaskUser = req.body.metaMaskUser;
    // 单独保存表单数据的各个字段
    const voteTitle = formData.voteTitle;
    const numOptions = formData.numOptions;
    const options = [];
    for (let i = 1; i <= numOptions; i++) {
        options.push(formData['option' + i]);
    }

    // 获取截止时间的时间戳（毫秒）
    const deadlineTimestamp = new Date(formData.deadline).getTime();
    try {
        // 部署新的合约
        let newContractInstance = await new web3.eth.Contract(contractABI)
            .deploy({
                data: contractBytecode,
                arguments: [voteTitle, options, deadlineTimestamp] // 传递合约到构造函数中，但是由于本地字节码是源码的，需要再次调用合约函数
            })
            .send({
                from: metaMaskUser, // 使用全局变量中存储的调用者地址来部署合约
                gas: 1500000, // 指定 gas 上限
                gasPrice: '30000000000' // 指定 gas 价格
            }); 

        // 存入日志文件中
        logger.info({
            message: "Successfully to create a new contract",
            contractAddress: newContractInstance.options.address,
            createdBy: metaMaskUser,
            voteTitle,
            deadlineTimestamp,
            options
        });

        res.json({ success: true, contractAddress: newContractInstance.options.address });
        // 在成功部署合约后调用该函数，将合约信息插入到数据库中
        insertDataIntoBallots(metaMaskUser, newContractInstance.options.address, voteTitle, formData.deadline);

        initContract(voteTitle, options, deadlineTimestamp, metaMaskUser, newContractInstance);
        // 部署合约成功后获取区块和交易信息
        // 获取最新区块的信息
        const block = await web3.eth.getBlock('latest');
        const blockData = {
            blockId: block.number,
            timestamp: block.timestamp,
            blockHash: block.hash,
            parentHash: block.parentHash,
            difficulty: block.difficulty,
            miner: block.miner,
            stateRoot: block.stateRoot,
            transactionsRoot: block.transactionsRoot,
            receiptsRoot: block.receiptsRoot,
            txHash: block.transactions,
            gasUsed: block.gasUsed,
            gasLimit: block.gasLimit,
            fromAddress: metaMaskUser,
            toAddress: newContractInstance.options.address,
            uncles: block.uncles
        };
        // 保存区块信息到leveldb数据库
        await saveBlockData(blockData);
    } catch (error) {
        // 记录出错时的日志信息
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ error: 'Failed to deploy contract' });
    }
});

// 使用合约实例调用Solidity合约中的函数
async function initContract(voteTitle, options, deadlineTimestamp, metaMaskUser, newContractInstance) {
    try {
        // 调用Solidity合约中的setTitle函数
        await newContractInstance.methods.setTitle(voteTitle).send({
            from: metaMaskUser, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 调用Solidity合约中的setOptions函数
        await newContractInstance.methods.setOptions(options).send({
            from: metaMaskUser, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 调用Solidity合约中的setDeadline函数
        await newContractInstance.methods.setDeadline(deadlineTimestamp).send({
            from: metaMaskUser, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 设置投票状态
        await newContractInstance.methods.setIsOpen(true).send({
            from: metaMaskUser, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });
    } catch (error) {
        // 记录错误日志
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
    }
}

// 查询整个网络上的区块
app.get('/ethereum', async  (req, res) => {
    try {
        // 创建一个空数组来存储从 Leveldb 中检索的数据
        const blockDataArray = [];

        // 使用 createReadStream 方法从 Leveldb 中读取数据
        db.createReadStream()
            .on('data', function (data) {
                // 将每个键值对添加到 blockDataArray 数组中
                blockDataArray.push(data);
            })
            .on('error', function (error) {
                // 如果发生错误，则向客户端发送错误响应
                logger.error({
                    errorMessage: error.message,
                    stackTrace: error.stack
                });
                console.error('Error while reading data from Leveldb:', error);
                res.status(500).json({ success: false, error: 'Failed to read data from Leveldb' });
            })
            .on('end', function () {
                // 当读取结束时，将 blockDataArray 数组发送到前端
                res.json({ success: true, data: blockDataArray });
            });
    } catch (error) {
        // 如果发生错误，则向客户端发送错误响应
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        console.error('Error while retrieving data from Leveldb:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve data from Leveldb' });
    }
});

app.get('/getBallotInfo', async (req, res) => {
    try {
        const contractAddress = req.query.contractAddress;
        // 创建合约实例
        const contractInstance = new web3.eth.Contract(contractABI, contractAddress);

        // 调用合约实例的方法获取投票项目信息
        const options = await contractInstance.methods.getOptions().call();
        const title = await contractInstance.methods.getBallotTitle().call();
        const deadlineTimestamp = await contractInstance.methods.getDeadline().call();

        // 将时间戳转换为格式化的日期
        const deadlineDate = new Date(Number(deadlineTimestamp));
        const formattedDeadline = deadlineDate.toLocaleString();

        // 返回获取到的投票项目信息，包括格式化后的截止日期
        res.json({ options, title, deadline: formattedDeadline });
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ error: 'Failed to get ballot info' });
    }
});

// 获取当前用户创建的智能合约
app.post('/getContracts', (req, res) => {
    const userPublicKey = req.body.publicKey;
    const sql = `SELECT * FROM ballots WHERE creator_address = ? AND deleted = false`;
    pool.query(sql, [userPublicKey], (error, results) => {
        if (error) {
            logger.error({
                errorMessage: error.message,
                stackTrace: error.stack
            });
            res.status(500).json({ error: 'Failed to fetch contracts' });
            return;
        }
        res.json({ contracts: results });
    });
});


app.post('/deleteContract', (req, res) => {
    const contractAddress = req.body.contractAddress;
    const publicKey = req.body.publicKey;
    console.log(contractAddress);
    console.log(publicKey);
    // 检查用户是否有权限删除合约，这里可以根据实际需求进行权限验证

    // 更新数据库中对应合约的 deleted 字段为真
    const queryString = 'UPDATE ballots SET deleted = true WHERE contract_address = ? AND creator_address = ?';
    pool.query(queryString, [contractAddress, publicKey], (err, result) => {
        if (err) {
            console.error('更新数据库时出错:', err);
            res.status(500).json({ success: false, message: '合约删除失败' });
            return;
        }
        console.log('合约删除成功');
        res.json({ success: true, message: '合约删除成功' });
    });
});

// 获取当前用户参加过的投票项目
app.post('/getHistoryContracts', (req, res) => {
    const userPublicKey = req.body.publicKey;
    const sql = `SELECT * FROM history_contracts WHERE voter_address = ?`;
    pool.query(sql, [userPublicKey], (error, results) => {
        if (error) {
            logger.error({
                errorMessage: error.message,
                stackTrace: error.stack
            });
            res.status(500).json({ error: 'Failed to fetch contracts' });
            return;
        }
        res.json({ contracts: results });
    });
});

// 进行投票
app.post('/vote', async (req, res) => {
    try {
        let result;
        const contractAddress = req.query.contractAddress;
        const selectedOption = decodeURIComponent(req.query.selectedOption);
        const publicKey = req.query.publicKey;
        const contractInstance = new web3.eth.Contract(contractABI, contractAddress);

        // 调用合约实例的方法获取投票项目信息
        const deadlineTimestamp = await contractInstance.methods.getDeadline().call();
        const voteTitle = await contractInstance.methods.getBallotTitle().call();
        // 获取当前时间戳
        const currentTimestamp = Math.floor(Date.now());
        // 如果当前时间晚于投票截止日期，则投票已经截至
        if (currentTimestamp >= deadlineTimestamp) {
            res.json({ success: false, message: '投票已经截止' });
            return;
        }
        // 已经投过票
        const hasVoted = await contractInstance.methods.hasVotedForBallot(contractAddress).call();
        if(hasVoted) {
            res.json({ success: false, message: '您已经投过票了' });
            return;
        }
        // 调用合约的投票函数
        await contractInstance.methods.castVote(selectedOption).send({
            from: publicKey, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });
        const deadlineData = new Date(Number(deadlineTimestamp));
        await insertHistoryContract(contractAddress, publicKey, voteTitle, deadlineData, selectedOption);
        // 发送响应
        res.json({ success: true });
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ success: false, error: '投票失败' });
    }
});

// 搜索合约的路由处理程序
app.post('/searchContracts', async (req, res) => {
    try {
        const keyword = req.body.keyword;
        const userPublicKey = req.body.userPublicKey;

        // 构建 SQL 查询语句
        let query;
        let queryParams;
        if (/^0x[a-fA-F0-9]{40}$/.test(keyword)) {
            // 如果关键字是合约地址，则查询指定地址的合约信息
            query = 'SELECT * FROM ballots WHERE contract_address = ? AND creator_address = ?';
            queryParams = [keyword, userPublicKey];
        } else {
            // 如果关键字不是合约地址，则执行模糊查询
            query = 'SELECT * FROM ballots WHERE (contract_address LIKE ? OR vote_title LIKE ?) AND creator_address = ?';
            const searchTerm = '%' + keyword + '%';
            queryParams = [searchTerm, searchTerm, userPublicKey];
        }

        // 执行数据库查询
        pool.query(query, queryParams, (error, results, fields) => {
            if (error) {
                logger.error({
                    errorMessage: error.message,
                    stackTrace: error.stack
                });
                res.status(500).json({ message: '内部服务器错误' });
                return;
            }
            if (results.length === 0) {
                res.status(404).json({ message: '未找到匹配的合约或项目' });
                return;
            }
            // 返回查询结果
            res.json({ contracts: results });
        });
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ message: '内部服务器错误' });
    }
});

// 搜索历史合约的路由处理程序
app.post('/searchHistoryContracts', async (req, res) => {
    try {
        const keyword = req.body.keyword;
        const userPublicKey = req.body.userPublicKey;

        // 构建 SQL 查询语句
        let query;
        let queryParams;
        if (/^0x[a-fA-F0-9]{40}$/.test(keyword)) {
            // 如果关键字是合约地址，则查询指定地址的合约信息
            query = 'SELECT * FROM history_contracts WHERE contract_address = ? AND voter_address = ?';
            queryParams = [keyword, userPublicKey];
        } else {
            // 如果关键字不是合约地址，则执行模糊查询
            query = 'SELECT * FROM history_contracts WHERE (contract_address LIKE ? OR vote_title LIKE ?) AND voter_address = ?';
            const searchTerm = '%' + keyword + '%';
            queryParams = [searchTerm, searchTerm, userPublicKey];
        }

        // 执行数据库查询
        pool.query(query, queryParams, (error, results, fields) => {
            if (error) {
                logger.error({
                    errorMessage: error.message,
                    stackTrace: error.stack
                });
                res.status(500).json({ message: '内部服务器错误' });
                return;
            }
            if (results.length === 0) {
                res.status(404).json({ message: '未找到匹配的合约或项目' });
                return;
            }
            // 返回查询结果
            res.json({ contracts: results });
        });
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ message: '内部服务器错误' });
    }
});

// 路由处理函数，根据合约地址返回合约详情数据
app.post('/getContractDetails', async (req, res) => {
    try {
        const contractAddress = req.body.contractAddress; // 从请求体中获取合约地址
        // 创建合约实例
        const contractInstance = new web3.eth.Contract(contractABI, contractAddress);

        // 调用合约实例的方法获取投票项目信息
        const options = await contractInstance.methods.getOptions().call();
        const title = await contractInstance.methods.getBallotTitle().call();
        const deadlineTimestamp = await contractInstance.methods.getDeadline().call();
        const isOpen = await contractInstance.methods.getIsOpen().call();
        // 获取每个候选项的得票数
        const voteCounts = await contractInstance.methods.getVoteCounts().call();
        // 将时间戳转换为格式化的日期
        const deadlineDate = new Date(Number(deadlineTimestamp));
        const formattedDeadline = deadlineDate.toLocaleString();
        // 返回获取到的投票项目信息，包括格式化后的截止日期和每个候选项的得票数
        res.json({ options, title, deadline: formattedDeadline, voteCounts });
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stackTrace: error.stack
        });
        res.status(500).json({ error: 'Failed to get ballot info' });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info('begin working!');
    logger.info({
        message: `Server is running on port ${PORT}`,
    });
    console.log(`Server is running on port ${PORT}`);
});
