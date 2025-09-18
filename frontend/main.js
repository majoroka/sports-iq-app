// URL do nosso backend API
const API_URL = 'http://localhost:5001/api/fixtures';

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

        initializeFilters();
    } catch (error) {
        console.error("Could not fetch fixtures:", error);
        const tableBody = document.querySelector("#fixtures-table tbody");
        tableBody.innerHTML = `<tr><td colspan="4" class="loading">Error loading data. Is the backend running?</td></tr>`;
    }
}

/**
 * Popula os dropdowns de filtro com valores únicos e adiciona event listeners.
 */
function initializeFilters() {
    const allDates = [...new Set(fixturesData.map(f => f.Date))].sort();
    populateDropdown(dateFilter, allDates, "All Dates");

    // Popula a tabela com todos os dados inicialmente
    populateFixturesTable(fixturesData);

    // Adicionar event listeners
    dateFilter.addEventListener('change', applyDateFilter);
    clearFiltersBtn.addEventListener('click', resetAll);
}

/**
 * Filtra a tabela com base na data selecionada.
 */
function applyDateFilter() {
    const selectedDate = dateFilter.value;
    let tableData = fixturesData;

    if (selectedDate) {
        tableData = fixturesData.filter(f => f.Date === selectedDate);
    }

    populateFixturesTable(tableData);
    document.getElementById('dashboard').classList.add('hidden');
}

/**
 * Limpa todos os filtros e restaura o estado inicial.
 */
function resetAll() {
    dateFilter.value = "";
    populateFixturesTable(fixturesData);
    document.getElementById('dashboard').classList.add('hidden');
}

/**
 * Helper genérico para popular um elemento <select>.
 */
function populateDropdown(selectElement, options, defaultText) {
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        selectElement.appendChild(option);
    });
}

/**
 * Preenche a tabela de jogos com os dados recebidos.
 * @param {Array} data - Array de objectos de jogos.
 */
function populateFixturesTable(data) {
    const tableBody = document.querySelector("#fixtures-table tbody");
    tableBody.innerHTML = ""; // Limpar o estado de "loading"

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="loading">No fixtures found for the selected filters.</td></tr>`;
        return;
    }

    data.forEach((fixture, index) => {
        const row = document.createElement('tr');
        // Adicionar uma classe se as odds não estiverem disponíveis
        if (!fixture.odds_available) {
            row.classList.add('no-odds');
        }

        row.innerHTML = `
            <td>${fixture.Date}</td>
            <td>${fixture.Country}</td>
            <td>${fixture.Home}</td>
            <td>${fixture.Away}</td>
        `;

        row.dataset.fixtureIndex = index;
        row.addEventListener('click', () => { // Lógica simplificada
            updateDashboard(fixture);
            document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
        });
        tableBody.appendChild(row);
    });
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
    document.getElementById('dash-game-details').textContent = `${fixture.Date} | ${fixture.Country}`;

    if (fixture.odds_available) {
        dashboardContent.classList.remove('hidden');
        noOddsMessage.classList.add('hidden');

        // 2. Odds Principais (1X2)
        const { probabilities, odds } = fixture;
        document.getElementById('odd-home').textContent = odds.homeWin.toFixed(2);
        document.getElementById('prob-home').textContent = `${(probabilities.homeWin * 100).toFixed(1)}%`;
        
        document.getElementById('odd-draw').textContent = odds.draw.toFixed(2);
        document.getElementById('prob-draw').textContent = `${(probabilities.draw * 100).toFixed(1)}%`;

        document.getElementById('odd-away').textContent = odds.awayWin.toFixed(2);
        document.getElementById('prob-away').textContent = `${(probabilities.awayWin * 100).toFixed(1)}%`;

        // 3. Gráfico de Distribuição de Vitórias
        updateWinDistributionChart(probabilities);

        // 4. Tabela de Outros Mercados
        populateOtherMarketsTable(odds);
        
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
            maintainAspectRatio: false,
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
function populateOtherMarketsTable(odds) {
    const table = document.getElementById('other-markets-table');
    
    // Criar uma lista mais estruturada de mercados para exibição
    const markets = [
        { label: '1X (Casa ou Empate)', value: odds.doubleChance['1X'] },
        { label: '12 (Casa ou Fora)', value: odds.doubleChance['12'] },
        { label: 'X2 (Empate ou Fora)', value: odds.doubleChance['X2'] },
        
        { label: 'Mais de 0.5 Golos', value: odds.overUnder.over0_5 },
        { label: 'Mais de 1.5 Golos', value: odds.overUnder.over1_5 },
        { label: 'Mais de 2.5 Golos', value: odds.overUnder.over2_5 },
        { label: 'Mais de 3.5 Golos', value: odds.overUnder.over3_5 },

        { label: 'Casa +0.5', value: odds.asianHandicap.home_plus_0_5 },
        { label: 'Casa +1.5', value: odds.asianHandicap.home_plus_1_5 },
        { label: 'Fora +0.5', value: odds.asianHandicap.away_plus_0_5 },
        { label: 'Fora +1.5', value: odds.asianHandicap.away_plus_1_5 },

        { label: 'BTTS - Sim', value: odds.btts.yes },
        { label: 'BTTS - Não', value: odds.btts.no },

        { label: '1 & BTTS Sim', value: odds.resultAndBtts.home_and_btts_yes },
        { label: '2 & BTTS Sim', value: odds.resultAndBtts.away_and_btts_yes },

        { label: '0-1 Golos', value: odds.goalRanges.goals_0_1 },
        { label: '2-3 Golos', value: odds.goalRanges.goals_2_3 },
        { label: '4+ Golos', value: odds.goalRanges.goals_4_plus },

        { label: 'Casa vence por 1 (1# CS)', value: odds.correctScoreGroups.home_by_1 },
        { label: 'Casa vence por 2 (2# CS)', value: odds.correctScoreGroups.home_by_2 },
        { label: 'Fora vence por 1 (3# CS)', value: odds.correctScoreGroups.away_by_1 },
        { label: 'Fora vence por 2 (4# CS)', value: odds.correctScoreGroups.away_by_2 },
    ];

    let html = '<tbody>';
    for (const market of markets) {
        // Apenas exibir o mercado se a odd foi calculada (não é nula)
        if (market.value) {
            html += `<tr><td>${market.label}</td><td>${market.value.toFixed(2)}</td></tr>`;
        }
    }
    html += '</tbody>';
    table.innerHTML = html;
}

/**
 * Gera e exibe a heatmap de probabilidades de resultado exato.
 * @param {Array<Array<number>>} matrix - A matriz 2D de probabilidades.
 */
function generateHeatmap(matrix) {
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
            // Cor de fundo baseada na probabilidade
            const alpha = Math.min(prob * 15, 1); // Aumenta o contraste
            const color = `rgba(233, 69, 96, ${alpha})`;
            html += `<td style="background-color: ${color};">${percentage}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    table.innerHTML = html;
}