const VotingSystem = artifacts.require("VotingSystem");

module.exports = function(deployer) {
  // 部署 VotingContract 合约
  deployer.deploy(VotingSystem);
};
