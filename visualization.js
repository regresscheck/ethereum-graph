const VELOCITY_DECAY = 0.9;

var pruningRange = document.getElementById('pruningRange');
var svg = d3.select("#field");
var field = document.getElementById('field');
var width = field.clientWidth,
    height = field.clientHeight;

var color = d3.scaleOrdinal(d3.schemeCategory20);

var nodes = [];
var links = [];
var hashVertices = {};
var hashLinks = {};
var latestBlockNumber = 0;

function openInNewTab(url) {
    var win = window.open(url, '_blank');
    win.focus();
}

function nodeRadius(d) {
    return 1.5 + Math.log1p(d.connections);
}

function linkDistance(d) {
    return 10 + 7 * Math.log1p(d.source.connections * d.target.connections);
}

function linkStrokeWidth(d) {
    return Math.max(0.3, Math.min(1, Math.log1p(d.score)));
}

function pruningFunction(a, b) {
    return b.score - 100 * (b.connections === 0) + b.blockNumber - b.biggestNeighbor.connections * 0.2
        - a.score + 100 * (b.connections === 0) - a.blockNumber + a.biggestNeighbor.connections * 0.2;
}

function ticked() {
    node.attr("r", nodeRadius)
        .attr("cx", function (d) {
            return d.x;
        })
        .attr("cy", function (d) {
            return d.y;
        });

    link.attr("x1", function (d) {
        return d.source.x;
    })
        .attr("y1", function (d) {
            return d.source.y;
        })
        .attr("x2", function (d) {
            return d.target.x;
        })
        .attr("y2", function (d) {
            return d.target.y;
        });

}

var simulation = d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(-15))
    .force("link", d3.forceLink(links).distance(linkDistance))
    .force("x", d3.forceX(width / 2).strength(0.10))
    .force("y", d3.forceY(height / 2).strength(0.10))
    .alphaTarget(1)
    .velocityDecay(VELOCITY_DECAY)
    .on("tick", ticked);

var g = svg.append("g"),
    link = g.append("g").attr("stroke", "#000").attr("stroke-width", 0.4).selectAll(".link"),
    node = g.append("g").on("click", function () {
        console.log(d3.event.target.__data__);
        var id = d3.event.target.__data__.id;
        openInNewTab('https://etherscan.io/address/' + id);
    }).selectAll(".node");

function restartGraph() {
    // Apply the general update pattern to the nodes.
    node = node.data(nodes, function (d) {
        return d.id;
    });
    node.exit().remove();
    node = node.enter().append("circle").attr("fill", function (d) {
        return color(d.id);
    }).attr("r", nodeRadius).merge(node);
    node.transition();

    // Apply the general update pattern to the links.
    link = link.data(links, function (d) {
        return d.source.id + "-" + d.target.id;
    });
    link.exit().remove();
    link = link.enter().append("line").attr("stroke-width", linkStrokeWidth).merge(link);
    // Update and restart the simulation.
    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(1);
    simulation.restart();
}

restartGraph();

function getOrCreateVertex(hash) {
    var vertex;
    if (hash in hashVertices) {
        vertex = hashVertices[hash];
    } else {
        vertex = {
            id: hash,
            score: 0,
            connections: 0,
            blockNumber: 0,
            biggestNeighbor: null,
            placed: false
        };
        hashVertices[hash] = vertex;
    }
    return vertex;
}

function getOrCreateEdge(from, to, score) {
    var edge;
    var hash = edgeHash(from.id, to.id);
    if (hash in hashLinks) {
        edge = hashLinks[hash];
    } else {
        edge = {
            source: from,
            target: to,
            placed: false,
            score: 0,
            blockNumber: 0
        };
        hashLinks[hash] = edge;
    }
    if (!edge.placed) {
        links.push(edge);
        edge.placed = true;
        from.connections += 1;
        from.score += score;
        to.connections += 1;
        to.score += score;
    }
    edge.score += score;
    return edge;
}

function edgeHash(a, b) {
    if (a < b) {
        return a + b;
    } else {
        return b + a;
    }
}

function filterInPlace(array, condition) {
    var nextPosition = 0;
    for (var i = 0; i < array.length; i++) {
        if (condition(array[i])) {
            if (i !== nextPosition) {
                array[nextPosition] = array[i];
            }
            nextPosition++;
        }
    }
    array.length = nextPosition;
}

function updateVertex(vertex, connectedVertex, blockNumber) {
    vertex.blockNumber = blockNumber;
    if (!vertex.placed) {
        nodes.push(vertex);
        vertex.placed = true;
    }
    if (vertex.biggestNeighbor === null || connectedVertex.connections > vertex.biggestNeighbor.connections) {
        vertex.biggestNeighbor = connectedVertex;
    }
}

function processEdge(from, to, value, blockNumber) {
    latestBlockNumber = Math.max(latestBlockNumber, blockNumber);
    if (from === to) {
        return;
    }
    var fromVertex = getOrCreateVertex(from);
    var toVertex = getOrCreateVertex(to);

    if (!fromVertex.placed) {
        if (!toVertex.placed) {
            fromVertex.x = width / 2;
            fromVertex.y = height / 2;
            toVertex.x = fromVertex.x;
            toVertex.y = fromVertex.y;
        } else {
            fromVertex.x = toVertex.x;
            fromVertex.y = toVertex.y;
        }
    } else {
        if (!toVertex.placed) {
            toVertex.x = fromVertex.x;
            toVertex.y = fromVertex.y;
        }
    }
    updateVertex(fromVertex, toVertex, blockNumber);
    updateVertex(toVertex, fromVertex, blockNumber);

    var edge = getOrCreateEdge(fromVertex, toVertex, value);
    edge.blockNumber = blockNumber;
    nodes.sort(pruningFunction);
    var maxNodes = pruningRange.value;
    for (var i = maxNodes; i < nodes.length; i++) {
        nodes[i].placed = false;
        nodes[i].biggestNeighbor = null;
    }
    nodes.length = Math.min(maxNodes, nodes.length);
    filterInPlace(links, function (link) {
        if (!link.source.placed || !link.target.placed) {
            link.source.connections -= 1;
            link.source.score -= link.score;
            link.target.connections -= 1;
            link.target.score -= link.score;
            link.placed = false;
            return false;
        }
        return true;
    });
}