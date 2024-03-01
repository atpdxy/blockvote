# blockvote-基于区块链的投票系统

## 一、准备

**操作系统：**Windows10专业版

**node：**v20.11.0

**npm：**10.2.4

**ganache：**v2.7.1

**truffle：**v5.11.5 (core: 5.11.5)

**web3：**1.10.0

**metamask：**11.10.0

**mysql：**5.7.2

## 二、下载源码

使用HTTPS或SSH克隆源码，或者下载压缩包。

## 三、浏览器安装meta mask插件

测试时使用的chrome浏览器，安装插件并创建账户后需要添加一个测试网络，通过ganache来提供，在meta mask中添加网络，选择手动添加网络，主要需要添加下面的几个内容：

1. 网络名称：自己起名，随便，建议test或者localhost；
2. 新的RPC URL：打开ganache快速启动一个ETHEREUM，在靠近CONTRACT底下有RPC SERVER，将内容原封不动复制然后输入（据说有人大写变小写就不能用了）；
3. 链ID：RPC SERVER左边的NETWORK ID就是；
4. 货币符号：ETH；
5. 区块浏览器URL（可选）：不用填写。

在meta mask中选择新建的测试网络，利用ganache提供的私钥添加账户，试试转账有没有问题。

## 四、编译模板合约

确保第三步的ganache已经成功连接了。

进入到项目根目录，使用truffle编译合约：`truffle compile`，然后部署合约:`truffle migrate`。

## 五、运行

执行指令`node app.js`运行投票项目。
