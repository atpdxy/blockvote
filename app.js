// 引入所需的库和模块
const express = require('express');
const app = express();
const path = require('path');
const Web3 = require('web3');
const VotingSystemContract = require('./build/contracts/VotingSystem.json');
// 获取合约ABI和字节码
const contractABI = VotingSystemContract.abi;
const contractBytecode = VotingSystemContract.bytecode;
// 连接到以太坊网络
const web3 = new Web3('http://localhost:7545');
// const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));
// 创建合约实例
const myContract = new web3.eth.Contract(contractABI);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 使用 express.urlencoded() 中间件解析表单数据
app.use(express.urlencoded({ extended: true }));

// 使用 express.json() 中间件解析 JSON 数据
app.use(express.json());

// 合约全局实例对象
let newContractInstance;

// 在顶层定义一个全局变量来存储调用者地址
let callerAddress;

const mysql = require('mysql'); // 使用mysql2模块

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
            console.error('插入数据时发生错误:', error);
            return;
        }
        console.log('成功插入数据到 ballots 表');
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
    process.exit(0);
  });
});

// 在合适的地方设置 callerAddress 全局变量的值，例如处理请求的中间件中
// app.use(async (req, res, next) => {
//     try {
//         // 获取当前 MetaMask 账户地址
//         const accounts = await web3.eth.getAccounts();
//         callerAddress = accounts[1]; // 设置为全局变量 callerAddress
//         console.log('当前 MetaMask 账户地址:', callerAddress);
//     } catch (error) {
//         console.error('获取 MetaMask 账户地址时出错:', error);
//         // 如果出错，可以选择将 callerAddress 设置为 null 或其他默认值
//         callerAddress = null;
//     }
//     next();
// });

// 创建 POST 请求路由来接收 MetaMask 用户地址数据
app.post('/checkMetaMaskUser', (req, res) => {
    const { address } = req.body; // 从请求体中获取 MetaMask 用户地址数据
    console.log('收到的 MetaMask 用户地址:', address);
    // 假设这里直接返回成功的响应
    callerAddress = address;
    console.log('callerAddress: ', callerAddress);
    res.status(200).json({ message: '成功接收到 MetaMask 用户地址数据' });
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

    console.log(voteTitle);
    console.log(options);
    console.log(deadlineTimestamp);
    console.log(metaMaskUser);

    try {
        // 部署新的合约
        newContractInstance = await new web3.eth.Contract(contractABI)
            .deploy({
                data: contractBytecode,
                arguments: [voteTitle, options, deadlineTimestamp] // 如果合约有构造函数参数，将它们传递给 arguments
            })
            .send({
                from: metaMaskUser, // 使用全局变量中存储的调用者地址来部署合约
                gas: 1500000, // 指定 gas 上限
                gasPrice: '30000000000' // 指定 gas 价格
            }); 
    
        console.log('新合约已部署，合约地址：', newContractInstance.options.address);
        res.json({ success: true, contractAddress: newContractInstance.options.address });
        // 在成功部署合约后调用该函数，将合约信息插入到数据库中
        insertDataIntoBallots(metaMaskUser, newContractInstance.options.address, voteTitle, formData.deadline);

        initContract(voteTitle, options, deadlineTimestamp);
        
        setTimeout(async () => {
            // 查询智能合约的状态，确保状态已更新
            const options_test = await newContractInstance.methods.getOptions().call();
            const title_test = await newContractInstance.methods.getBallotTitle().call();
            const deadline_test = await newContractInstance.methods.getDeadline().call();
            console.log('投票项目选项:', options_test);
            console.log('投票项目标题:', title_test);
            console.log('投票项目截止日期:', deadline_test);
        }, 1000); // 1000毫秒 = 1秒
    } catch (error) {
        console.error('部署合约时发生错误：', error);
        res.status(500).json({ error: 'Failed to deploy contract' });
    }
});

// 使用合约实例调用Solidity合约中的函数
async function initContract(voteTitle, options, deadlineTimestamp) {
    try {
        // 调用Solidity合约中的setTitle函数
        await newContractInstance.methods.setTitle(voteTitle).send({
            from: callerAddress, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 调用Solidity合约中的setOptions函数
        await newContractInstance.methods.setOptions(options).send({
            from: callerAddress, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 调用Solidity合约中的setDeadline函数
        await newContractInstance.methods.setDeadline(deadlineTimestamp).send({
            from: callerAddress, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 设置投票状态
        await newContractInstance.methods.setIsOpen(true).send({
            from: callerAddress, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        console.log("合约函数调用成功！");
    } catch (error) {
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
        
        console.log('投票项目标题:', title);
        console.log('投票项目选项:', options);
        console.log('投票项目截止日期时间戳:', deadlineTimestamp);

        // 将时间戳转换为格式化的日期
        const deadlineDate = new Date(Number(deadlineTimestamp));
        const formattedDeadline = deadlineDate.toLocaleString();

        console.log('格式化的截止日期:', formattedDeadline);

        // 返回获取到的投票项目信息，包括格式化后的截止日期
        res.json({ options, title, deadline: formattedDeadline });
    } catch (error) {
        console.error('获取投票项目信息时出错：', error);
        res.status(500).json({ error: 'Failed to get ballot info' });
    }
});

// 获取当前用户创建的智能合约
app.post('/getContracts', (req, res) => {
    const userPublicKey = req.body.publicKey;
    const sql = `SELECT * FROM ballots WHERE creator_address = ?`;
    console.log('in getContracts function: ', userPublicKey);
    pool.query(sql, [userPublicKey], (error, results) => {
        if (error) {
            console.error('Error fetching contracts:', error);
            res.status(500).json({ error: 'Failed to fetch contracts' });
            return;
        }

        res.json({ contracts: results });
    });
});

app.post('/vote', async (req, res) => {
    try {
        console.log('in vote function');
        let result;
        const contractAddress = req.query.contractAddress;
        console.log('请求访问的用户地址: ', contractAddress);
        const selectedOption = req.query.selectedOption;
        const publicKey = req.query.publicKey;
        console.log('前端传递的meta mask用户地址: ', publicKey);
        const contractInstance = new web3.eth.Contract(contractABI, contractAddress);
        // 调用合约实例的方法获取投票项目信息
        const deadlineTimestamp = await contractInstance.methods.getDeadline().call();
        
        // 获取当前时间戳
        const currentTimestamp = Math.floor(Date.now() / 1000);
        console.log('currentTimestamp: ', currentTimestamp);
        console.log('deadlineTimestamp: ', deadlineTimestamp);
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
        console.log('投票项目截止日期时间戳:', formattedDeadline);
        console.log('用户选择：', selectedOption);
        console.log('合约地址为：', contractAddress);
        // 调用合约的投票函数
        await contractInstance.methods.castVote(selectedOption).send({
            from: publicKey, // 从这个地址发送交易
            gas: 3000000 // 设置gas限制
        });

        // 发送响应
        res.json({ success: true });
    } catch (error) {
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

        
        console.log('投票项目标题:', title);
        console.log('投票项目选项:', options);
        console.log('投票项目截止日期时间戳:', deadlineTimestamp);

        // 获取每个候选项的得票数
        const voteCounts = await contractInstance.methods.getVoteCounts().call();

        // 将时间戳转换为格式化的日期
        const deadlineDate = new Date(Number(deadlineTimestamp));
        const formattedDeadline = deadlineDate.toLocaleString();

        console.log('格式化的截止日期:', formattedDeadline);
        console.log('每个选项获得的票数:', voteCounts);
        // 返回获取到的投票项目信息，包括格式化后的截止日期和每个候选项的得票数
        res.json({ options, title, deadline: formattedDeadline, voteCounts });
    } catch (error) {
        console.error('获取投票项目信息时出错：', error);
        res.status(500).json({ error: 'Failed to get ballot info' });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
