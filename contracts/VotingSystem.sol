// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VotingSystem {
    struct Ballot {
        string title;
        string[] options;
        uint256 deadline;
        bool isOpen;
        mapping(string => uint256) voteCounts;
        mapping(address => bool) hasVoted; // 记录用户是否已经投票
    }

    Ballot public latestBallot; // 最新部署的合约的投票项目信息

    event BallotCreated(address indexed creator, string title, uint256 deadline);
    event VoteCasted(address indexed voter, uint256 result);

    function createBallot(string memory _title, string[] memory _options, uint256 _deadline) public {
        require(_options.length >= 2 && _options.length <= 10, "Number of options must be between 2 and 10");
        latestBallot.title = _title;
        latestBallot.options = _options;
        latestBallot.deadline = _deadline;
        latestBallot.isOpen = true;

        emit BallotCreated(msg.sender, _title, _deadline);
    }

    function setTitle(string memory _title) public {
        latestBallot.title = _title;
    }

    function setOptions(string[] memory _options) public {
        latestBallot.options = _options;
    }

    function setDeadline(uint256 _deadline) public {
        latestBallot.deadline = _deadline;
    }

    function setIsOpen(bool _isOpen) public {
        latestBallot.isOpen = _isOpen;
    }

    function castVote(string memory _option) public {
        require(!latestBallot.hasVoted[msg.sender], "You have already voted.");
        require(latestBallot.isOpen, "Voting has already finished");
        latestBallot.voteCounts[_option]++;
        latestBallot.hasVoted[msg.sender] = true; // 记录用户已经投票

        emit VoteCasted(msg.sender, 1); // 1 表示投票成功
    }

    function finalizeBallot() public {
        require(block.timestamp >= latestBallot.deadline, "Voting is still ongoing");
        latestBallot.isOpen = false;
    }

    // 判断某个用户是否已经对该合约进行投票
    function hasVotedForBallot(address _voter) public view returns (bool) {
        return latestBallot.hasVoted[_voter];
    }

    // 获取最新投票项目的候选项列表
    function getOptions() public view returns (string[] memory) {
        return latestBallot.options;
    }

    // 获取最新投票项目的投票项目名
    function getBallotTitle() public view returns (string memory) {
        return latestBallot.title;
    }

    // 获取最新投票项目的截止日期
    function getDeadline() public view returns (uint256) {
        return latestBallot.deadline;
    }

    // 获取当前的时间戳
    function getCurrentTimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    function getIsOpen() public view returns (bool) {
        return latestBallot.isOpen;
    }

    function getWinner() public view returns (string memory) {
        require(!latestBallot.isOpen, "Voting is still ongoing");
        require(block.timestamp >= latestBallot.deadline, "Voting has not ended yet");

        uint256 maxVotes = 0;
        string memory winner;
        
        // 遍历所有选项，找到获胜者
        for (uint256 i = 0; i < latestBallot.options.length; i++) {
            uint256 votes = latestBallot.voteCounts[latestBallot.options[i]];
            if (votes > maxVotes) {
                maxVotes = votes;
                winner = latestBallot.options[i];
            }
        }
        return winner;
    }

    // 获取每个候选项的得票数
    function getVoteCounts() public view returns (uint256[] memory) {
        uint256[] memory counts = new uint256[](latestBallot.options.length);
        for (uint256 i = 0; i < latestBallot.options.length; i++) {
            counts[i] = latestBallot.voteCounts[latestBallot.options[i]];
        }
        return counts;
    }
}
