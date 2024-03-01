// 引入所需的库和模块
const express = require('express');
const app = express();
const path = require('path');
const fs = require("fs");
const pino = require('pino');
const Web3 = require('web3');
const mysql = require('mysql'); // 使用mysql2模块

// 获取合约ABI和字节码
const VotingSystemContract = require('./build/contracts/VotingSystem.json');
const contractABI = VotingSystemContract.abi;
const contractBytecode = VotingSystemContract.bytecode;

// 连接到以太坊网络
const web3 = new Web3('http://localhost:7545');

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 流日志
const stream = fs.createWriteStream("./log.txt");
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
            console.error('插入数据时发生错误:', error);
            return;
        }
    });
}
  
// 在应用程序关闭时关闭数据库连接
process.on('SIGINT', () => {
  pool.end((err) => {
    if (err) {
      console.error('关闭数据库连接时出错:', err);
      process.exit(1);
    }
    console.log('成功关闭数据库连接');
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
                arguments: [voteTitle, options, deadlineTimestamp] // 如果合约有构造函数参数，将它们传递给 arguments
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
    } catch (error) {
        // 记录出错时的日志信息
        logger.error({
            message: 'Failed to create new contract',
            errorMessage: error.message,
            stackTrace: error.stack
        });

        console.error('部署合约时发生错误：', error);
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
            message: 'Failed to initalize a contract',
            callerAddress: metaMaskUser,
            contract: newContractInstance,
            errorMessage: error.message,
            stackTrace: error.stack
        });
        console.error("调用合约函数时发生错误:", error);
    }
}

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
            message: 'Failed to get details from contract',
            errorMessage: error.message,
            stackTrace: error.stack
        });
        console.error('获取投票项目信息时出错：', error);
        res.status(500).json({ error: 'Failed to get ballot info' });
    }
});

// 获取当前用户创建的智能合约
app.post('/getContracts', (req, res) => {
    const userPublicKey = req.body.publicKey;
    const sql = `SELECT * FROM ballots WHERE creator_address = ?`;
    pool.query(sql, [userPublicKey], (error, results) => {
        if (error) {
            console.error('Error fetching contracts:', error);
            logger.error({
                message: 'Failed to get all contracts by current user',
                userAddress: userPublicKey,
                errorMessage: error.message,
                stackTrace: error.stack
            });
            res.status(500).json({ error: 'Failed to fetch contracts' });
            return;
        }

        res.json({ contracts: results });
    });
});

app.post('/vote', async (req, res) => {
    try {
        let result;
        const contractAddress = req.query.contractAddress;
        const selectedOption = req.query.selectedOption;
        const publicKey = req.query.publicKey;
        const contractInstance = new web3.eth.Contract(contractABI, contractAddress);
        // 调用合约实例的方法获取投票项目信息
        const deadlineTimestamp = await contractInstance.methods.getDeadline().call();
        // 获取当前时间戳
        const currentTimestamp = Math.floor(Date.now() / 1000);
        // 将时间戳转换为格式化的日期
        const deadlineDate = new Date(Number(deadlineTimestamp));
        const formattedDeadline = deadlineDate.toLocaleString();

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

        // 发送响应
        res.json({ success: true });
    } catch (error) {
        logger.error({
            message: 'Failed to vote',
            errorMessage: error.message,
            stackTrace: error.stack
        });
        console.error('投票时出错：', error);
        res.status(500).json({ success: false, error: '投票失败' });
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
            message: 'Failed to get details from a contract',
            contractAddress: contractAddress,
            errorMessage: error.message,
            stackTrace: error.stack
        });
        console.error('获取投票项目信息时出错：', error);
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
