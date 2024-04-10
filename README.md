# 说明：

本项目是一个基于区块链的投票系统。

# 配置说明：

`操作系统：`                             `Windows10专业版`

`Nodejs:`			                   `v20.11.0`

`npm:	`		                     	    `v10.2.4`

`Truffle:`		                    `v5.11.5(core: 5.11.5)`

`Solidity:`                          `v0.5.16(solc-js)`

`Web3:`                                  `v1.10.0`

`Ganache: `                           `Windows v2.7.1`

`metamask: `						 `v11.10.0`

`mysql: `                 	          `v5.7.2`

# 准备工作：

1. 安装好`Nodejs`、`Ganache`，`mysql`数据库

2. 在浏览器上安装`meta mask`插件并添加测试网络。

   测试时使用的`chrome`浏览器，安装插件并创建账户后需要添加一个测试网络，通过`Ganache`来提供，在`meta mask`中添加网络，选择手动添加网络，主要需要添加下面的几个内容：

   - 网络名称：自己起名，随便，建议`test`或者`localhost`；
   - 新的`RPC URL`：打开`Ganache`快速启动一个`ETHEREUM`，在靠近`CONTRACT`底下有`RPC SERVER`，将内容原封不动复制然后输入（据说有人大写变小写就不能用了）；
   - 链ID：`RPC SERVER`左边的`NETWORK ID`就是；
   - 货币符号：`ETH`；
   - 区块浏览器`URL`（可选）：不用填写。

   在`meta mask`中选择新建的测试网络，利用`Ganache`提供的私钥添加账户，试试转账有没有问题。

3. 利用`git`或者其他下载器下载源码。项目中使用的包可以利用`npm`下载，根据`package-lock.json`文件，使用指令`npm install`来下载。也可以直接从`Github`上将整个项目下载下来。

4. 配置`MySQL`数据库。创建表：

   ```
   // 合约表
   CREATE TABLE ballots (
       id INT(11) NOT NULL AUTO_INCREMENT,
       creator_address VARCHAR(42) NOT NULL,
       contract_address VARCHAR(42) NOT NULL,
       vote_title VARCHAR(255) NOT NULL,
       deadline TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       deleted TINYINT(1) NOT NULL DEFAULT 0,
       PRIMARY KEY (id)
   );
   ```

   - `id`: 整数类型，用作主键，自动递增。
   - `creator_address`: 字符串类型，存储创建者地址。
   - `contract_address`: 字符串类型，存储合约地址。
   - `vote_title`: 字符串类型，存储投票标题。
   - `deadline`: 时间戳类型，存储截止日期，默认为当前时间。
   - `created_at`: 时间戳类型，存储创建时间，默认为当前时间。
   - `deleted`: TINYINT 类型，存储是否删除的标志，默认为 0，表示未删除。

   ```
   // 投票表
   CREATE TABLE history_contracts (
       id INT(11) NOT NULL AUTO_INCREMENT,
       contract_address VARCHAR(255) NOT NULL,
       voter_address VARCHAR(255) NOT NULL,
       vote_title VARCHAR(255) NOT NULL,
       deadline TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       user_choice VARCHAR(255) NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id)
   );
   ```

   - `id`: 整数类型，用作主键，自动递增。

   - `contract_address`: 字符串类型，存储合约地址。

   - `voter_address`: 字符串类型，存储投票者地址。

   - `vote_title`: 字符串类型，存储投票标题。

   - `deadline`: 时间戳类型，存储截止日期，默认为当前时间，更新时自动更新。

   - `user_choice`: 字符串类型，存储用户选择。

   - `created_at`: 时间戳类型，存储创建时间，默认为当前时间。、

   创建好表后，修改源码`app.js`中的数据库连接信息。

4. 启动`Ganache`

5. 编译并部署合约。

   合约的配置放在`truffle-config.js`文件内，根据情况修改。

   - 编译合约：`truffle compile`；
   - 部署合约：`truffle migrate`。

6. 启动项目：`node app.js`。
