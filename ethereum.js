const PRELOAD_BLOCKS = 30;

var web3 = new Web3();

web3 = new Web3(Web3.givenProvider || new Web3.providers.HttpProvider("http://localhost:8545"));

var lastBlockHash = '';
var queue = [];


function processBlock(blockId) {
    web3.eth.getBlock(blockId, true, function(err, block) {
        if (err) {
            console.log(err);
        } else {
            if (block.hash === lastBlockHash) {
                return;
            }
            lastBlockHash = block.hash;
            block.transactions.forEach(function(transaction) {
                queue.push({
                    from: transaction.from,
                    to: transaction.to,
                    value: new BigNumber(transaction.value).dividedBy(1e18).toNumber(),
                    blockNumber: block.number
                });
            });
        }
    });
}

function processQueue() {
    requestAnimationFrame(processQueue);
    if (queue.length > 0) {
        var edge = queue.shift();
        processEdge(edge.from, edge.to, edge.value, edge.blockNumber);
        restartGraph();
    }
}

requestAnimationFrame(processQueue);

function tickBlockchain() {
    processBlock('latest');
}

if (web3.isConnected()) {
    var lastBlock = web3.eth.blockNumber;
    for (var i = lastBlock - PRELOAD_BLOCKS; i < lastBlock; i++) {
        processBlock(i);
    }
    setInterval(tickBlockchain, 3000);
} else {
    console.log('Could not connect to node');
}