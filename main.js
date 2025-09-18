// URL do nosso backend API
const API_URL = '/api/fixtures'; // Correct for deployment

// Elementos dos filtros
const dateFilter = document.getElementById('date-filter');
const clearFiltersBtn = document.getElementById('clear-filters');

// Variável global para guardar os dados dos jogos e o gráfico
let fixturesData = [];
let winDistributionChart = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchFixtures();
});

/**
 * Vai buscar os dados dos jogos à API e preenche a tabela.
 */
async function fetchFixtures() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        fixturesData = await response.json();
        // Adicionar um ID único a cada jogo para facilitar a seleção
        fixturesData.forEach((fixture, index) => fixture.id = index);

        initializeFilters(); // Initialize filters after data is fetched
    } catch (error) {
        console.error("Could not fetch fixtures:", error);
        // Could display an error message on the page here
    }
}

/**
 * Popula os dropdowns de filtro com valores únicos e adiciona event listeners.
 */
function initializeFilters() {
    const allDates = [...new Set(fixturesData.map(f => f.Date))].sort();
    populateDropdown(dateFilter, allDates, "Select a Date");

    // Initially, the game filter is disabled
    gameFilter.innerHTML = `<option value="">Select a Date First</option>`;
    gameFilter.disabled = true;

    // Adicionar event listeners
    dateFilter.addEventListener('change', handleDateChange);
    gameFilter.addEventListener('change', handleGameChange);
    clearFiltersBtn.addEventListener('click', resetAll);
}

/**
 * Lida com a mudança no filtro de data.
 */
function handleDateChange() {
    const selectedDate = dateFilter.value;
    document.getElementById('dashboard').classList.add('hidden');

    if (!selectedDate) {
        gameFilter.innerHTML = `<option value="">Select a Date First</option>`;
        gameFilter.disabled = true;
        return;
    }

    const gamesOnDate = fixturesData.filter(f => f.Date === selectedDate);
    const gameOptions = gamesOnDate.map(f => ({ value: f.id, text: `${f.Home} vs ${f.Away}` }));
    
    populateDropdown(gameFilter, gameOptions, "Select a Game", null, true);
    gameFilter.disabled = false;
}

/**
 * Lida com a seleção de um jogo.
 */
function handleGameChange() {
    const selectedGameId = parseInt(gameFilter.value, 10);

    if (isNaN(selectedGameId)) {
        document.getElementById('dashboard').classList.add('hidden');
        return;
    }

    const selectedFixture = fixturesData.find(f => f.id === selectedGameId);
    if (selectedFixture) {
        updateDashboard(selectedFixture);
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Limpa todos os filtros e restaura o estado inicial.
 */
function resetAll() {
    dateFilter.value = "";
    gameFilter.innerHTML = `<option value="">Select a Date First</option>`;
    gameFilter.disabled = true;
    document.getElementById('dashboard').classList.add('hidden');
}

/**
 * Helper genérico para popular um elemento <select>.
 */
function populateDropdown(selectElement, options, defaultText, selectedValue, isObject = false) {
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    options.forEach(opt => {
        const option = document.createElement('option');
        if (isObject) {
            option.value = opt.value;
            option.textContent = opt.text;
        } else {
            option.value = opt;
            option.textContent = opt;
        }
        selectElement.appendChild(option);
    });
    if (selectedValue) {
        selectElement.value = selectedValue;
    }
}

/**
 * Safely formats a number as a string with 2 decimal places.
 * Returns a placeholder if the input is null or invalid.
 * @param {number | null} num The number to format.
 * @returns {string} The formatted number or '-'.
 */
function safeToFixed(num) {
    if (num === null || typeof num !== 'number' || isNaN(num)) {
        return '-';
    }
    return num.toFixed(2);
}

/**
 * Atualiza o dashboard com os detalhes de um jogo selecionado.
 * @param {Object} fixture - O objecto do jogo selecionado.
 */
function updateDashboard(fixture) {
    const dashboard = document.getElementById('dashboard');
    const dashboardContent = document.getElementById('dashboard-content');
    const noOddsMessage = document.getElementById('no-odds-message');

    dashboard.classList.remove('hidden');

    // 1. Informações do Jogo
    document.getElementById('dash-game-title').textContent = `${fixture.Home} vs ${fixture.Away}`;
    document.getElementById('dash-game-details').textContent = `${fixture.Date} | ${fixture.Country}`; // Corrected to remove Competition

    if (fixture.odds_available) {
        dashboardContent.classList.remove('hidden');
        noOddsMessage.classList.add('hidden');

        // 2. Odds Principais (1X2)
        const { probabilities, odds } = fixture;
        document.getElementById('odd-home').textContent = safeToFixed(odds.homeWin);
        document.getElementById('prob-home').textContent = `${(probabilities.homeWin * 100).toFixed(1)}%`;
        
        document.getElementById('odd-draw').textContent = safeToFixed(odds.draw);
        document.getElementById('prob-draw').textContent = `${(probabilities.draw * 100).toFixed(1)}%`;

        document.getElementById('odd-away').textContent = safeToFixed(odds.awayWin);
        document.getElementById('prob-away').textContent = `${(probabilities.awayWin * 100).toFixed(1)}%`;

        // 3. Gráfico de Distribuição de Vitórias
        updateWinDistributionChart(probabilities);

        // 4. Tabela de Outros Mercados
        populateMarketsGrid(odds);
        
        // 5. Heatmap de Resultados Exatos
        generateHeatmap(fixture.correctScoreHeatmap);
    } else {
        dashboardContent.classList.add('hidden');
        noOddsMessage.classList.remove('hidden');
    }
}

/**
 * Atualiza o gráfico de barras com as novas probabilidades.
 * @param {Object} probabilities - Objecto com as probabilidades de homeWin, draw, awayWin.
 */
function updateWinDistributionChart(probabilities) {
    const ctx = document.getElementById('win-distribution-chart').getContext('2d');
    
    // Se o gráfico já existe, destrói-o para criar um novo
    if (winDistributionChart) {
        winDistributionChart.destroy();
    }

    winDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Home Win', 'Draw', 'Away Win'],
            datasets: [{
                label: 'Probability',
                data: [
                    probabilities.homeWin * 100,
                    probabilities.draw * 100,
                    probabilities.awayWin * 100
                ],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(201, 203, 207, 0.6)',
                    'rgba(255, 99, 132, 0.6)'
                ],
                borderColor: [
                    'rgb(75, 192, 192)',
                    'rgb(201, 203, 207)',
                    'rgb(255, 99, 132)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '%'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Preenche a tabela de mercados secundários.
 * @param {Object} odds - O objecto com todas as odds calculadas.
 */
function populateMarketsGrid(odds) {
    const container = document.getElementById('markets-grid');
    container.innerHTML = ''; // Limpar conteúdo anterior

    const createMarketRow = (label, value) => {
        if (value === null || value === undefined) return '';
        return `
            <div class="market-row">
                <span class="market-label">${label}</span>
                <span class="market-value">${safeToFixed(value)}</span>
            </div>
        `;
    };

    // Coluna 1: Double Chance
    const dcCol = document.createElement('div');
    dcCol.className = 'market-column';
    dcCol.innerHTML = `
        <h4>Double Chance</h4>
        ${createMarketRow('1X', odds.doubleChance['1X'])}
        ${createMarketRow('12', odds.doubleChance['12'])}
        ${createMarketRow('X2', odds.doubleChance['X2'])}
    `;
    container.appendChild(dcCol);

    // Coluna 2: Gols
    const goalsCol = document.createElement('div');
    goalsCol.className = 'market-column';
    goalsCol.innerHTML = `
        <h4>Gols</h4>
        ${createMarketRow('+0.5', odds.overUnder.over0_5)}
        ${createMarketRow('+1.5', odds.overUnder.over1_5)}
        ${createMarketRow('+2.5', odds.overUnder.over2_5)}
        ${createMarketRow('+3.5', odds.overUnder.over3_5)}
    `;
    container.appendChild(goalsCol);

    // Coluna 3: BTTS
    const bttsCol = document.createElement('div');
    bttsCol.className = 'market-column';
    bttsCol.innerHTML = `
        <h4>BTTS</h4>
        ${createMarketRow('Sim', odds.btts.yes)}
        ${createMarketRow('Não', odds.btts.no)}
        ${createMarketRow('1 & BTTS', odds.resultAndBtts.home_and_btts_yes)}
        ${createMarketRow('2 & BTTS', odds.resultAndBtts.away_and_btts_yes)}
    `;
    container.appendChild(bttsCol);

    // Coluna 4: Correct Score
    const csCol = document.createElement('div');
    csCol.className = 'market-column';
    let csHtml = '<h4>Correct Score</h4>';
    if (odds.topCorrectScores && odds.topCorrectScores.length > 0) {
        odds.topCorrectScores.forEach((cs, index) => {
            csHtml += createMarketRow(`${index + 1}# CS: ${cs.score}`, cs.odd);
        });
    }
    csCol.innerHTML = csHtml;
    container.appendChild(csCol);
}

/**
 * Gera e exibe a heatmap de probabilidades de resultado exato.
 * @param {Array<Array<number>>} matrix - A matriz 2D de probabilidades.
 */
function generateHeatmap(matrix) {
    if (!matrix || matrix.length === 0) {
        document.getElementById('heatmap-table').innerHTML = '<tr><td>Heatmap data not available.</td></tr>';
        return;
    }

    // 1. Encontrar a probabilidade máxima para normalização
    let maxProb = 0;
    matrix.forEach(row => row.forEach(prob => {
        if (prob > maxProb) maxProb = prob;
    }));
    if (maxProb === 0) maxProb = 1; // Evitar divisão por zero

    // 2. Definir as cores para o gradiente
    const colorLow = [255, 99, 132];   // Away win color
    const colorMid = [201, 203, 207];  // Draw color
    const colorHigh = [75, 192, 192];  // Home win color

    const interpolateColor = (p) => {
        let r, g, b;
        if (p < 0.5) {
            // Interpolar entre Low e Mid
            const t = p * 2;
            r = colorLow[0] + t * (colorMid[0] - colorLow[0]);
            g = colorLow[1] + t * (colorMid[1] - colorLow[1]);
            b = colorLow[2] + t * (colorMid[2] - colorLow[2]);
        } else {
            // Interpolar entre Mid e High
            const t = (p - 0.5) * 2;
            r = colorMid[0] + t * (colorHigh[0] - colorMid[0]);
            g = colorMid[1] + t * (colorHigh[1] - colorMid[1]);
            b = colorMid[2] + t * (colorHigh[2] - colorMid[2]);
        }
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    };

    const table = document.getElementById('heatmap-table');
    let html = '<thead><tr><th class="header-cell">H\\A</th>';
    // Cabeçalho (Golos Fora)
    for (let j = 0; j < matrix[0].length; j++) {
        html += `<th class="header-cell">${j}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Linhas (Golos Casa)
    for (let i = 0; i < matrix.length; i++) {
        html += `<tr><th class="header-cell home-header">${i}</th>`;
        for (let j = 0; j < matrix[i].length; j++) {
            const prob = matrix[i][j];
            const percentage = (prob * 100).toFixed(1);
            const normalizedProb = prob / maxProb;
            const color = interpolateColor(normalizedProb);
            html += `<td style="background-color: ${color};">${percentage}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    table.innerHTML = html;
}