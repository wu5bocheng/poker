let ws;
let isAdmin = false;
let chipsLeft = 1000; // Initial chips
let chipsInPot = 0;
let totalPot = 0; // Total chips in the pot across all players
let currentBet = 0;
let initialChipCount = 1000; // Default initial chips
let defaultRaiseAmount = 100; // Default raise amount
let playersData = {}; // Store all players' data locally
let selectedWinners = new Set();
let clientId;

document.getElementById("connect").addEventListener("click", () => {
    const address = document.getElementById("server-address").value.trim();
    const port = document.getElementById("server-port").value.trim() || "8080";
    let clientName = document.getElementById("client-name").value.trim();

    if (!address || !clientName) {
        alert("Please enter the server address and your name.");
        return;
    }

    ws = new WebSocket(`ws://${address}:${port}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ action: "join", clientName }));
        document.getElementById("setup").style.display = "none";
        document.getElementById("app").style.display = "block";
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        switch (message.action) {
            case "status":
                playersData = JSON.parse(message.data);
                updateUI();
                break;
            case "updateSettings":
                initialChipCount = message.data.initialChipCount;
                defaultRaiseAmount = message.data.defaultRaiseAmount;
                alert(`New Settings: Initial Chips = ${initialChipCount}, Default Raise = ${defaultRaiseAmount}`);
                break;
            case "admin":
                isAdmin = true;
                document.getElementById("admin-controls").style.display = "block";
                renderAdminControls();
                break;
            case "clientId":
                clientId = message.data;
                break;
        }
    };
});

document.getElementById("raise").addEventListener("click", () => {
    const chipAmount = parseInt(document.getElementById("chip-amount").value) || defaultRaiseAmount;
    if (chipsInPot + chipAmount < currentBet) {
        alert(`After raise amount must be greater than the current bet (${currentBet}).`);
        return;
    }
    if (chipsLeft >= chipAmount) {
        chipsLeft -= chipAmount;
        chipsInPot += chipAmount;
        sendAction("raise", chipAmount);
        updateUI();
    } else {
        alert("Not enough chips!");
    }
});


document.getElementById("follow").addEventListener("click", () => {
    const chipsToFollow = currentBet - chipsInPot;
    if (chipsToFollow <= 0) {
        alert("You are already at the current bet.");
        return;
    }
    if (chipsLeft >= chipsToFollow) {
        chipsLeft -= chipsToFollow;
        chipsInPot += chipsToFollow;
        sendAction("follow", chipsToFollow);
        updateUI();
    } else {
        alert("Not enough chips to follow!");
    }
});


document.getElementById("fold").addEventListener("click", () => {
    sendAction("fold");
});

document.getElementById("set-winner").addEventListener("click", () => {
    if (selectedWinners.size === 0) {
        alert("Please select at least one winner.");
        return;
    }

    const winnerList = Array.from(selectedWinners).join(", ");
    if (confirm(`Confirm winners: ${winnerList}?`)) {
        sendAction("setWinner", { winners: Array.from(selectedWinners) });
        selectedWinners.clear();
        document.querySelectorAll(".winner-button.selected").forEach((button) => {
            button.classList.remove("selected");
        });
    }
});

function sendAction(action, data = null) {
    ws.send(JSON.stringify({ action, data }));
}

function updateUI() {
    chipsLeft = playersData[clientId]?.chipsLeft ?? chipsLeft;
    chipsInPot = playersData[clientId]?.chipsInPot ?? chipsInPot;
    currentBet = Math.max(...Object.values(playersData).map(player => player.chipsInPot), 0);

    totalPot = Object.values(playersData).reduce((sum, player) => sum + player.chipsInPot, 0);

    document.getElementById("chips-left").textContent = chipsLeft;
    document.getElementById("chips-in-pot").textContent = chipsInPot;
    document.getElementById("total-pot").textContent = totalPot;
    document.getElementById("current-bet").textContent = currentBet;

    renderPlayerButtons();
    renderAdminControls();

    // Display current turn
    const currentPlayer = Object.values(playersData).find(player => player.isCurrentTurn);
    if (currentPlayer) {
        document.getElementById("turn-indicator").textContent = `Waiting for ${currentPlayer.name} to respond`;
    } else {
        document.getElementById("turn-indicator").textContent = "No active player";
    }
}


function renderPlayerButtons() {
    const playerButtonsContainer = document.getElementById("player-buttons-container");
    playerButtonsContainer.innerHTML = ""; // Clear previous buttons

    for (const playerId in playersData) {
        const player = playersData[playerId];

        // Create a button for each player
        const button = document.createElement("button");
        button.textContent = `${player.name} (${player.hasFolded})`;
        button.dataset.id = playerId;
        button.classList.add("player-status");

        // If the player has folded, disable the button and add a class
        if (player.hasFolded === 'Folded') {
            button.disabled = true;
            button.classList.add("folded");
        }

        // Highlight the current player
        if (player.isCurrentTurn) {
            button.classList.add("current-turn");
        }

        // Add event listener for selection
        button.addEventListener("click", () => {
            if (button.classList.contains("selected")) {
                button.classList.remove("selected");
                selectedWinners.delete(playerId); // Remove from selected winners
            } else {
                button.classList.add("selected");
                selectedWinners.add(playerId); // Add to selected winners
            }
        });

        playerButtonsContainer.appendChild(button);
    }
}


function renderAdminControls() {
    if (!isAdmin) return;

    const adminTable = document.getElementById("admin-table");
    adminTable.innerHTML = ""; // Clear previous content

    for (const playerId in playersData) {
        const player = playersData[playerId];
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = player.name;
        row.appendChild(nameCell);

        const chipsCell = document.createElement("td");
        const chipsInput = document.createElement("input");
        chipsInput.type = "number";
        chipsInput.value = player.chipsLeft;
        chipsInput.dataset.id = playerId;
        chipsCell.appendChild(chipsInput);
        row.appendChild(chipsCell);

        const updateButton = document.createElement("button");
        updateButton.textContent = "Update";
        updateButton.onclick = () => {
            const newChips = parseInt(chipsInput.value);
            if (newChips >= 0) {
                sendAction("updateChips", { playerId, chipsLeft: newChips });
            } else {
                alert("Chip count cannot be negative.");
            }
        };
        row.appendChild(updateButton);

        adminTable.appendChild(row);
    }
}
