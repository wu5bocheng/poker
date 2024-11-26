const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let adminAssigned = false;
let initialChipCount = 1000;
let defaultRaiseAmount = 100;
let totalPot = 0;
let turnIndex = 0;
let bankerOffset = 0;
const playerOrder = [];


wss.on("connection", (ws) => {
    let clientId;

    ws.on("message", (message) => {
        const { action, data, clientName } = JSON.parse(message);

        if (action === "join") {
            clientId = Object.entries(players).find(([id, player]) => player.name === clientName)?.[0] || Date.now().toString();

            ws.send(JSON.stringify({ action: "clientId", data: clientId }));

            if (players[clientId]) {
                // Handle duplicate connections
                players[clientId].ws.close();
                players[clientId].ws = ws;
            }

            players[clientId] = players[clientId] || {
                name: clientName,
                chipsLeft: initialChipCount,
                chipsInPot: 0,
                hasFolded: false,
                isCurrentTurn: false,
                ws,
                isAdmin: false,
            };


            if (!adminAssigned || players[clientId].isAdmin) {
                ws.send(JSON.stringify({ action: "admin" }));
                players[clientId].isAdmin = true;
                if (!adminAssigned) {
                    players[clientId].isCurrentTurn = true;
                }
                adminAssigned = true;
                console.log(`${clientName} is assigned as admin.`);
            }

            broadcastStatus();
        } else if (action === "raise") {
            if (!players[clientId].hasFolded && players[clientId].isCurrentTurn) {
                players[clientId].chipsLeft -= data;
                players[clientId].chipsInPot += data;
                totalPot += data;
                nextTurn();
            }
        } else if (action === "follow") {
            if (!players[clientId].hasFolded && players[clientId].isCurrentTurn) {
                players[clientId].chipsLeft -= data;
                players[clientId].chipsInPot += data;
                totalPot += data;
                nextTurn();
            }
        } else if (action === "fold") {
            if (players[clientId].isCurrentTurn) {
                players[clientId].hasFolded = true;
                nextTurn();
            }
        } else if (action === "setWinner") {
            // Distribute the pot among winners
            const { winners } = data;
            bankerOffset += 1
            turnIndex = 0
            const totalPot = Object.values(players).reduce((sum, player) => sum + player.chipsInPot, 0);
            const chipsPerWinner = Math.floor(totalPot / winners.length);

            winners.forEach((winnerId) => {
                if (players[winnerId]) {
                    players[winnerId].chipsLeft += chipsPerWinner;
                }
            });

            // Reset players for the next round
            for (const playerId in players) {
                players[playerId].chipsInPot = 0;
                players[playerId].hasFolded = false;
            }

            broadcastStatus();
        } else if (action === "updateSettings") {
            if (players[clientId].isAdmin) {
                initialChipCount = data.initialChipCount;
                defaultRaiseAmount = data.defaultRaiseAmount;
                broadcastSettings();
            }
        } else if (action === "updateChips") {
            const { playerId, chipsLeft } = data;
            if (players[clientId].isAdmin && players[playerId]) {
                players[playerId].chipsLeft = chipsLeft;
                broadcastStatus();
            }
        }
    });

    ws.on("close", () => {
        if (players[clientId]?.isAdmin) {
            console.log("Admin disconnected. Reassigning admin...");
            adminAssigned = false;
            for (const id in players) {
                if (id !== clientId) {
                    players[id].isAdmin = true;
                    players[id].ws.send(JSON.stringify({ action: "admin" }));
                    adminAssigned = true;
                    console.log(`${players[id].name} is the new admin.`);
                    break;
                }
            }
        }
        broadcastStatus();
    });

    function broadcastStatus() {
        const sanitizedPlayers = Object.entries(players).reduce((acc, [id, player]) => {
            acc[id] = {
                name: player.name,
                chipsLeft: player.chipsLeft,
                chipsInPot: player.chipsInPot,
                hasFolded: player.hasFolded ? "Folded" : "Active",
                isCurrentTurn: player.isCurrentTurn,
            };
            return acc;
        }, {});

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ action: "status", data: JSON.stringify(sanitizedPlayers) }));
            }
        });
    }


    function broadcastSettings() {
        const settings = { initialChipCount, defaultRaiseAmount };
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ action: "updateSettings", data: settings }));
            }
        });
    }

    function nextTurn() {
        if (playerOrder.length === 0) {
            playerOrder.push(...Object.keys(players).filter(id => !players[id].hasFolded));
        }
        turnIndex += 1
        while (players[playerOrder[(bankerOffset + turnIndex) % playerOrder.length]].hasFolded) {
            turnIndex += 1
        }
        const currentTurnPlayerId = playerOrder[(bankerOffset + turnIndex) % playerOrder.length];

        for (const playerId in players) {
            players[playerId].isCurrentTurn = playerId === currentTurnPlayerId;
        }

        broadcastStatus();
    }
});
