import io
import requests
import pandas as pd
from flask import Flask, jsonify, render_template, url_for
from scipy.stats import poisson

# --- Constantes e Configuração ---
# Matriz para calcular probabilidades de golos (até 7 golos para cada equipa)
MAX_GOALS = 7

# URL da API para obter os jogos
FIXTURES_URL = "http://api.clubelo.com/Fixtures"

app = Flask(__name__, static_folder='static', template_folder='templates')

# --- Funções de Cálculo ---

def calculate_markets_from_api_data(row):
    """
    Calcula todos os mercados de apostas diretamente a partir das probabilidades pré-calculadas
    fornecidas pela API do Clubelo (colunas GD e R:).
    """
    def to_odd(p):
        # Helper para converter probabilidade em odd decimal, lidando com probabilidade zero.
        return round(1 / p, 2) if p > 0 else None

    # --- 1. Calcular 1X2 a partir das colunas de Diferença de Golos (GD) ---
    gd_cols = ['GD<-5', 'GD=-5', 'GD=-4', 'GD=-3', 'GD=-2', 'GD=-1', 'GD=0', 'GD=1', 'GD=2', 'GD=3', 'GD=4', 'GD=5', 'GD>5']
    if not all(col in row and pd.notna(row[col]) for col in gd_cols):
        return {"odds_available": False}

    p_home = row[['GD=1', 'GD=2', 'GD=3', 'GD=4', 'GD=5', 'GD>5']].sum()
    p_draw = row['GD=0']
    p_away = row[['GD<-5', 'GD=-5', 'GD=-4', 'GD=-3', 'GD=-2', 'GD=-1']].sum()

    # --- 2. Criar um DataFrame a partir das colunas de Resultado Exato (R:) ---
    result_cols = {k: v for k, v in row.items() if k.startswith('R:') and pd.notna(v)}
    if not result_cols:
        return {"odds_available": False}

    scores_data = []
    for col_name, prob in result_cols.items():
        try:
            scores = col_name.split(':')[1].split('-')
            hg, ag = int(scores[0]), int(scores[1])
            scores_data.append({'HG': hg, 'AG': ag, 'Prob': prob})
        except (ValueError, IndexError):
            continue
    df_scores = pd.DataFrame(scores_data)
    df_scores['TotalGoals'] = df_scores['HG'] + df_scores['AG']

    # --- 3. Calcular todos os outros mercados a partir do DataFrame de resultados ---

    # Over/Under
    p_total_le_1 = df_scores.loc[df_scores['TotalGoals'] <= 1, 'Prob'].sum()
    p_total_le_2 = df_scores.loc[df_scores['TotalGoals'] <= 2, 'Prob'].sum()
    p_total_le_3 = df_scores.loc[df_scores['TotalGoals'] <= 3, 'Prob'].sum()
    p_over_0_5 = 1 - df_scores.loc[(df_scores['HG'] == 0) & (df_scores['AG'] == 0), 'Prob'].sum()
    p_over_1_5 = 1 - p_total_le_1
    p_over_2_5 = 1 - p_total_le_2
    p_over_3_5 = 1 - p_total_le_3

    # Golos da Equipa
    p_home_over_0_5 = df_scores.loc[df_scores['HG'] >= 1, 'Prob'].sum()
    p_home_over_1_5 = df_scores.loc[df_scores['HG'] >= 2, 'Prob'].sum()
    p_away_over_0_5 = df_scores.loc[df_scores['AG'] >= 1, 'Prob'].sum()
    p_away_over_1_5 = df_scores.loc[df_scores['AG'] >= 2, 'Prob'].sum()

    # BTTS
    p_btts_yes = df_scores.loc[(df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum()
    p_btts_no = 1 - p_btts_yes

    # Resultado & BTTS
    p_home_and_btts = df_scores.loc[(df_scores['HG'] > df_scores['AG']) & (df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum()
    p_away_and_btts = df_scores.loc[(df_scores['AG'] > df_scores['HG']) & (df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum()

    # Intervalos de Golos
    p_goals_0_1 = df_scores.loc[df_scores['TotalGoals'].isin([0, 1]), 'Prob'].sum()
    p_goals_2_3 = df_scores.loc[df_scores['TotalGoals'].isin([2, 3]), 'Prob'].sum()
    p_goals_4_plus = df_scores.loc[df_scores['TotalGoals'] >= 4, 'Prob'].sum()

    # Top 4 Correct Scores
    top_4_cs = df_scores.sort_values(by='Prob', ascending=False).head(4)
    top_cs_odds_list = [{'score': f"{int(cs['HG'])}-{int(cs['AG'])}", 'odd': to_odd(cs['Prob'])} for _, cs in top_4_cs.iterrows()]

    # --- 4. Estruturar o output final ---
    probabilities = {
        "homeWin": p_home,
        "draw": p_draw,
        "awayWin": p_away,
    }
    odds = {
        "homeWin": to_odd(p_home),
        "draw": to_odd(p_draw),
        "awayWin": to_odd(p_away),
        "doubleChance": {
            "1X": to_odd(p_home + p_draw),
            "12": to_odd(p_home + p_away),
            "X2": to_odd(p_draw + p_away),
        },
        "overUnder": {
            "over0_5": to_odd(p_over_0_5),
            "over1_5": to_odd(p_over_1_5),
            "over2_5": to_odd(p_over_2_5),
            "over3_5": to_odd(p_over_3_5),
        },
        "teamGoalsOver": {
            "home_over_0_5": to_odd(p_home_over_0_5),
            "home_over_1_5": to_odd(p_home_over_1_5),
            "away_over_0_5": to_odd(p_away_over_0_5),
            "away_over_1_5": to_odd(p_away_over_1_5),
        },
        "btts": {
            "yes": to_odd(p_btts_yes),
            "no": to_odd(p_btts_no),
        },
        "resultAndBtts": {
            "home_and_btts_yes": to_odd(p_home_and_btts),
            "away_and_btts_yes": to_odd(p_away_and_btts),
        },
        "goalRanges": {
            "goals_0_1": to_odd(p_goals_0_1),
            "goals_2_3": to_odd(p_goals_2_3),
            "goals_4_plus": to_odd(p_goals_4_plus),
        },
        "topCorrectScores": top_cs_odds_list
    }

    # --- 5. Criar uma heatmap esparsa e segura a partir dos dados disponíveis ---
    heatmap_matrix = []
    if not df_scores.empty:
        max_h = df_scores['HG'].max()
        max_a = df_scores['AG'].max()

        # Garantir que max_h e max_a são números válidos antes de criar a matriz
        if pd.notna(max_h) and pd.notna(max_a):
            heatmap_matrix = [[0.0 for _ in range(int(max_a) + 1)] for _ in range(int(max_h) + 1)]
            for _, r in df_scores.iterrows():
                # Garantir que os índices são inteiros válidos
                if pd.notna(r['HG']) and pd.notna(r['AG']):
                    heatmap_matrix[int(r['HG'])][int(r['AG'])] = r['Prob']

    return {
        "odds_available": True,
        "probabilities": probabilities,
        "odds": odds,
        "correctScoreHeatmap": heatmap_matrix
    }

# --- Rota da API ---

@app.route('/')
def home():
    """Serve a página principal da aplicação."""
    return render_template('index.html')

@app.route('/api/fixtures')
def get_fixtures():
    try:
        # 1. Ler o CSV da API
        response = requests.get(FIXTURES_URL)
        response.raise_for_status()  # Lança um erro se o pedido falhar

        # Usar pandas para ler o CSV diretamente do texto da resposta
        csv_data = io.StringIO(response.text)
        df = pd.read_csv(csv_data)

        # 2. Processar cada jogo para calcular as odds
        results = []
        for index, row in df.iterrows():
            game_data = row.to_dict()

            # Calcular todos os mercados diretamente dos dados da API
            market_data = calculate_markets_from_api_data(row)
            game_data.update(market_data)

            results.append(game_data)

        # 3. Retornar os resultados em JSON
        return jsonify(results)

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch data from Clubelo API: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An internal error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run(debug=True)