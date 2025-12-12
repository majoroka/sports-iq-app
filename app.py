import io
import requests
import pandas as pd
import numpy as np
import traceback
from flask import Flask, jsonify, render_template
from json import JSONEncoder

class CustomJSONEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64)):
            return int(obj)
        if isinstance(obj, (np.floating, np.float64)):
            return float(obj)
        return super().default(obj)

# URL da API para obter os jogos
FIXTURES_URL = "http://api.clubelo.com/Fixtures"

app = Flask(__name__, static_folder='static', template_folder='templates')
app.json_encoder = CustomJSONEncoder

# --- Funções de Cálculo ---

def calculate_markets_from_api_data(row):
    """
    Calcula todos os mercados de apostas diretamente a partir das probabilidades pré-calculadas
    fornecidas pela API do Clubelo (colunas GD e R:).
    Garante que todos os valores numéricos retornados são tipos nativos de Python (float, int)
    para evitar erros de serialização JSON.
    """
    def to_odd(p):
        # Helper para converter probabilidade em odd decimal, lidando com probabilidade zero.
        # Garante que o resultado é um float nativo de Python ou None.
        if pd.isna(p) or p <= 0:
            return None
        return round(1 / float(p), 2)

    # --- 1. Calcular 1X2 a partir das colunas de Diferença de Golos (GD) ---
    gd_cols = ['GD<-5', 'GD=-5', 'GD=-4', 'GD=-3', 'GD=-2', 'GD=-1', 'GD=0', 'GD=1', 'GD=2', 'GD=3', 'GD=4', 'GD=5', 'GD>5']
    if not all(col in row and pd.notna(row[col]) for col in gd_cols):
        return {"odds_available": False}

    p_home = float(row[['GD=1', 'GD=2', 'GD=3', 'GD=4', 'GD=5', 'GD>5']].sum())
    p_draw = float(row['GD=0'])
    p_away = float(row[['GD<-5', 'GD=-5', 'GD=-4', 'GD=-3', 'GD=-2', 'GD=-1']].sum())

    # --- 2. Criar um DataFrame a partir das colunas de Resultado Exato (R:) ---
    result_cols = {k: v for k, v in row.items() if k.startswith('R:') and pd.notna(v)}
    if not result_cols:
        return {"odds_available": False}

    scores_data = [] # Lista para armazenar os dados de resultados exatos
    for col_name, prob_val in result_cols.items():
        try:
            scores = col_name.split(':')[1].split('-')
            hg, ag = int(scores[0]), int(scores[1])
            scores_data.append({'HG': hg, 'AG': ag, 'Prob': float(prob_val)}) # Garante que a probabilidade é um float nativo
        except (ValueError, IndexError):
            continue
    df_scores = pd.DataFrame(scores_data)
    df_scores['TotalGoals'] = df_scores['HG'] + df_scores['AG']

    if df_scores.empty:
        return {"odds_available": False}

    # --- 3. Calcular todos os outros mercados a partir do DataFrame de resultados ---
    # Over/Under
    p_total_le_1 = float(df_scores.loc[df_scores['TotalGoals'] <= 1, 'Prob'].sum())
    p_total_le_2 = float(df_scores.loc[df_scores['TotalGoals'] <= 2, 'Prob'].sum())
    p_total_le_3 = float(df_scores.loc[df_scores['TotalGoals'] <= 3, 'Prob'].sum())
    p_over_0_5 = float(1 - df_scores.loc[(df_scores['HG'] == 0) & (df_scores['AG'] == 0), 'Prob'].sum())
    p_over_1_5 = float(1 - p_total_le_1)
    p_over_2_5 = float(1 - p_total_le_2)
    p_over_3_5 = float(1 - p_total_le_3)

    # Golos da Equipa
    p_home_over_0_5 = float(df_scores.loc[df_scores['HG'] >= 1, 'Prob'].sum())
    p_home_over_1_5 = float(df_scores.loc[df_scores['HG'] >= 2, 'Prob'].sum())
    p_away_over_0_5 = float(df_scores.loc[df_scores['AG'] >= 1, 'Prob'].sum())
    p_away_over_1_5 = float(df_scores.loc[df_scores['AG'] >= 2, 'Prob'].sum())

    # BTTS
    p_btts_yes = float(df_scores.loc[(df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum())
    p_btts_no = float(1 - p_btts_yes)

    # Resultado & BTTS
    p_home_and_btts = float(df_scores.loc[(df_scores['HG'] > df_scores['AG']) & (df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum())
    p_away_and_btts = float(df_scores.loc[(df_scores['AG'] > df_scores['HG']) & (df_scores['HG'] > 0) & (df_scores['AG'] > 0), 'Prob'].sum())

    # Intervalos de Golos
    p_goals_0_1 = float(df_scores.loc[df_scores['TotalGoals'].isin([0, 1]), 'Prob'].sum())
    p_goals_2_3 = float(df_scores.loc[df_scores['TotalGoals'].isin([2, 3]), 'Prob'].sum())
    p_goals_4_plus = float(df_scores.loc[df_scores['TotalGoals'] >= 4, 'Prob'].sum())

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
    try:
        if not df_scores.empty:
            max_h_val = df_scores['HG'].max()
            max_a_val = df_scores['AG'].max()

            if pd.notna(max_h_val) and pd.notna(max_a_val):
                max_h = int(max_h_val)
                max_a = int(max_a_val)
                heatmap_matrix = [[0.0 for _ in range(max_a + 1)] for _ in range(max_h + 1)]
                for _, r in df_scores.iterrows():
                    if pd.notna(r['HG']) and pd.notna(r['AG']) and pd.notna(r['Prob']):
                        heatmap_matrix[int(r['HG'])][int(r['AG'])] = float(r['Prob'])
    except (ValueError, TypeError):
        heatmap_matrix = [] # Se houver um erro de conversão (ex: int(NaN)), retorna uma matriz vazia

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
    # Lista de fontes a tentar: HTTP, HTTPS e IP direto com header Host para contornar DNS
    sources = [
        ("primary_http", "http://api.clubelo.com/Fixtures", None),
        ("primary_https", "https://api.clubelo.com/Fixtures", None),
        ("ip_http_host_header", "http://37.128.134.74/Fixtures", {"Host": "api.clubelo.com"}),
    ]

    last_error = None
    df = None
    source_used = None

    # 1) Tentar API (http depois https)
    for source_name, url, headers in sources:
        try:
            response = requests.get(url, timeout=15, headers=headers or {})
            response.raise_for_status()
            csv_data = io.StringIO(response.text)
            df = pd.read_csv(csv_data)
            source_used = source_name
            break
        except requests.exceptions.RequestException as e:
            app.logger.warning(f"Failed to fetch from source {source_name}: {e}")
            last_error = e

    # 2) Fallback local se a API falhar
    if df is None:
        try:
            df = pd.read_csv("fixtures_fallback.csv")
            source_used = "local_fallback"
        except Exception as e:
            # Se nem o fallback funcionar, registar o erro e devolver uma resposta de erro clara.
            # O erro original (last_error ou e) não é serializável para JSON, por isso usamos str().
            app.logger.error(f"API and Fallback failed. Last API error: {last_error}. Fallback error: {e}\n{traceback.format_exc()}")
            return jsonify({"error": f"Could not load data from API or local fallback file. Please check server logs."}), 500

    try: # Adicionado para um melhor tratamento de erros durante o processamento
        # 3. Processar cada jogo para calcular as odds
        results = []
        for index, row in df.iterrows():
            # Converte a linha do DataFrame para um dicionário de tipos nativos de Python
            # para evitar erros de serialização JSON com tipos do NumPy (ex: int64).
            # Explicitamente converte para string para garantir compatibilidade JSON e evitar tipos Pandas/Numpy.
            game_info = {
                # Usar .isoformat() para um formato de data standard, se for um Timestamp.
                # Caso contrário, converter para string.
                "Date": pd.to_datetime(row.get("Date")).isoformat() if pd.notna(row.get("Date")) else None,
                "Country": str(row.get("Country")) if pd.notna(row.get("Country")) else None,
                "Home": str(row.get("Home")) if pd.notna(row.get("Home")) else None,
                "Away": str(row.get("Away")) if pd.notna(row.get("Away")) else None
            }

            # Calcular todos os mercados diretamente dos dados da API
            market_data = calculate_markets_from_api_data(row)

            # Combina os dados do jogo com os mercados calculados num novo dicionário
            results.append({**game_info, **market_data})

        # 4. Retornar os resultados em JSON
        return jsonify({"source": source_used, "fixtures": results})

    except Exception as e:
        # Log do erro detalhado no servidor para depuração
        app.logger.error(f"Error processing fixtures: {e}\n{traceback.format_exc()}")
        return jsonify({"error": "An internal server error occurred while processing game data."}), 500

if __name__ == '__main__':
    app.run(debug=True)
