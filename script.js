// =======================================================================
// === CONFIGURATION START ===
// =======================================================================

// !!! CRITICAL: REPLACE THIS WITH YOUR GOOGLE SHEET ID !!!
// The ID is the long string of characters in your sheet's URL.
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; 

// Make sure your sheets are PUBLISHED TO THE WEB (File > Share > Publish to the web)

// Tab Names - Must match your Google Sheet exactly.
const MANAGER_SQUADS_GID = 1; // Example GID for Manager Squads sheet
const PLAYER_SCORES_GID = 2; // Example GID for Player Scores sheet

// Constants for Fantasy Calculations
const CAPTAIN_MULTIPLIER = 2; // Captain score is 2x
const VICE_CAPTAIN_MULTIPLIER = 1; // Vice-Captain score is 1x (applied if Captain DNS)

// =======================================================================
// === CONFIGURATION END ===
// =======================================================================


// Utility to fetch and parse Google Sheet as CSV
const fetchSheetData = async (gid) => {
    // We use the CSV export format which is simplest to parse with JavaScript
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch sheet data for GID ${gid}: ${response.statusText}`);
    }
    const csvText = await response.text();
    return parseCSV(csvText);
};

// Simple CSV parser
const parseCSV = (csv) => {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        data.push(row);
    }
    return data;
};

// --- Main Calculation and Display Function ---
const renderFantasyLeague = async () => {
    try {
        const squadsData = await fetchSheetData(MANAGER_SQUADS_GID);
        const scoresData = await fetchSheetData(PLAYER_SCORES_GID);

        const playerScores = {}; // Key: PlayerName, Value: {GWScore: number, Price: number, RM: number, ...}
        scoresData.forEach(row => {
            playerScores[row.Player] = {
                // Parse scores and prices as numbers, handle errors gracefully
                GWScore: parseFloat(row['Fantasy Score']) || 0,
                Price: parseFloat(row['Current Price (M)'].replace(/[$,M]/g, '')) || 0,
                RM: parseFloat(row['RM']) || 1.0,
                Tour: row['Tour'] || 'N/A',
                // You would add more fields here if needed for display
            };
        });

        const leagueStandings = [];

        // 1. Process each manager's squad and calculate their GW and Total Score
        squadsData.forEach(managerRow => {
            const manager = managerRow.Manager;
            const players = [];
            let totalGWScore = 0;
            let totalBudget = parseFloat(managerRow['Total Budget (M)'].replace(/[$,M]/g, '')) || 100;
            let currentRosterValue = 0;
            let lastGWScore = parseFloat(managerRow['Last GW Score']) || 0; // Assuming this is tracked in the Sheet

            // Iterate over the 8 player slots (adjust headers based on your Sheet!)
            for (let i = 1; i <= 8; i++) {
                const playerName = managerRow[`Player ${i}`];
                const isStarter = managerRow[`Starter ${i}`] === 'Y';
                const isCaptain = managerRow[`Captain ${i}`] === 'C';
                const isViceCaptain = managerRow[`Captain ${i}`] === 'VC';
                
                const scoreInfo = playerScores[playerName] || { GWScore: 0, Price: 0 };
                let playerScore = scoreInfo.GWScore;
                
                // Calculate current roster value for the budget tracking
                currentRosterValue += scoreInfo.Price;

                // Apply Captaincy (assuming Captain/VC is only set among the 4 Starters)
                if (isStarter) {
                    if (isCaptain) {
                        playerScore *= CAPTAIN_MULTIPLIER;
                    } else if (isViceCaptain) {
                        // Complex Vice Captain logic is best handled in the Sheet
                        // For simplicity, we assume VC *only* counts if C=0.0
                        // Here, we just add the standard multiplier as a placeholder.
                        // You will need to manually ensure the sheet has the correct points entered for VC
                        playerScore *= VICE_CAPTAIN_MULTIPLIER; 
                    }
                    totalGWScore += playerScore;
                }
                
                players.push({
                    name: playerName,
                    isStarter,
                    isCaptain,
                    isViceCaptain,
                    score: scoreInfo.GWScore.toFixed(1), // Base Score for display
                    finalScore: playerScore.toFixed(1), // Multiplied Score
                    price: scoreInfo.Price.toFixed(1),
                    tour: scoreInfo.Tour
                });
            }

            leagueStandings.push({
                manager: manager,
                totalPoints: parseFloat(managerRow['Total Points']) || 0, // Get cumulative points from the Sheet
                lastGWScore: totalGWScore.toFixed(1), // Use calculated GW score for display
                totalBudget: totalBudget.toFixed(1),
                rosterValue: currentRosterValue.toFixed(1),
                players: players,
            });
        });
        
        // 2. Sort Standings by Total Points (Highest First)
        leagueStandings.sort((a, b) => b.totalPoints - a.totalPoints);
        
        // 3. Render Leaderboard Table
        const leaderboardBody = document.getElementById('leaderboard-body');
        leaderboardBody.innerHTML = ''; // Clear loading content

        leagueStandings.forEach((standing, index) => {
            const rank = index + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';

            const row = leaderboardBody.insertRow();
            row.innerHTML = `
                <td class="rank-cell ${rankClass}">${rank}</td>
                <td>${standing.manager}</td>
                <td>${standing.totalPoints.toFixed(1)}</td>
                <td>$${standing.totalBudget}M</td>
                <td>${standing.lastGWScore}</td>
            `;
        });

        // 4. Render Squad Sections
        const squadSection = document.getElementById('squad-section');
        squadSection.innerHTML = '<h2>Manager Rosters & Stats</h2>'; // Reset title
        
        leagueStandings.forEach(standing => {
            const card = document.createElement('div');
            card.className = 'manager-card';
            
            // Build the player list HTML
            let playerListHtml = standing.players.map(p => {
                let status = p.isCaptain ? ' (C)' : p.isViceCaptain ? ' (VC)' : p.isStarter ? ' (S)' : '';
                return `
                    <li>
                        <span>${p.name} (${p.tour})${status}</span>
                        <span class="player-price">$${p.price}M | ${p.finalScore} PTS</span>
                    </li>
                `;
            }).join('');
            
            card.innerHTML = `
                <h3>${standing.manager}</h3>
                <p><strong>Total Budget:</strong> $${standing.totalBudget}M | <strong>Roster Value:</strong> $${standing.rosterValue}M</p>
                <ul class="roster-list">${playerListHtml}</ul>
            `;
            squadSection.appendChild(card);
        });

        document.getElementById('loading').style.display = 'none';
        document.getElementById('update-time').textContent = new Date().toLocaleString();

    } catch (error) {
        console.error("An error occurred during rendering:", error);
        document.getElementById('loading').textContent = `Error loading data: ${error.message}. Check console for details.`;
    }
};

// Initial call to render the league when the page loads
document.addEventListener('DOMContentLoaded', renderFantasyLeague);
