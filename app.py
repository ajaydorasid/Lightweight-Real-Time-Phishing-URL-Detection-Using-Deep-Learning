import datetime
import json
import os
import time # Import the time library
import numpy as np
import tensorflow as tf
from urllib.parse import urlparse
from tensorflow.keras.preprocessing.text import tokenizer_from_json
from tensorflow.keras.preprocessing.sequence import pad_sequences
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

# --- 1. Initialize Flask App and Load Models ---
app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

MODEL_PATH = 'bilstm_attention_model_v2.h5'
TOKENIZER_PATH = 'tokenizer_bilstm_v2.json'
CLASSES_PATH = 'classes_bilstm_v2.npy'

if not all(os.path.exists(p) for p in [MODEL_PATH, TOKENIZER_PATH, CLASSES_PATH]):
    print("CRITICAL ERROR: One or more model files not found.")
    exit()

print("Loading trained model, tokenizer, and classes...")
model = tf.keras.models.load_model(MODEL_PATH)
with open(TOKENIZER_PATH) as f:
    data = json.load(f)
    tokenizer = tokenizer_from_json(data)
label_encoder_classes = np.load(CLASSES_PATH, allow_pickle=True)
print("Backend server is ready.")


# --- 2. In-Memory Database ---
scan_history = []
whitelist = ["google.com", "youtube.com"]


# --- 3. Helper Function ---
def get_phishing_reasons(url):
    reasons = []
    if any(keyword in url for keyword in ["login", "secure", "account", "update"]):
        reasons.append("Contains suspicious keywords often used to impersonate login pages.")
    if len(url.split('.')) > 3:
        reasons.append("URL has multiple subdomains, a tactic to hide the true domain.")
    if any(brand in url for brand in ["paypal", "ebay", "amazon", "google"]):
        reasons.append("Uses a brand name in the URL, potentially for impersonation.")
    if not reasons:
        reasons.append("The URL structure matches patterns commonly seen in malicious websites.")
    return reasons


# --- 4. Main Prediction Endpoint (UPDATED) ---
@app.route('/predict', methods=['POST'])
def predict():
    start_time = time.time() # Start timer
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'Invalid input. Please provide a URL.'}), 400

    url_to_check = data['url']
    
    try:
        domain = urlparse(url_to_check).netloc.replace('www.', '')
        if domain in whitelist:
            return jsonify({
                'url': url_to_check, 'status': 'legitimate', 'confidence': 100.0,
                'reasons': ['This domain is on your whitelist.']
            })
    except Exception as e:
        print(f"Could not parse domain from URL: {url_to_check}. Error: {e}")

    sequence = tokenizer.texts_to_sequences([url_to_check])
    padded_sequence = pad_sequences(sequence, maxlen=200, padding='post', truncating='post')
    
    try:
        prediction_prob = model.predict(padded_sequence)[0][0]
        latency = (time.time() - start_time) * 1000 # End timer and calculate latency in ms
        
        is_phishing = prediction_prob > 0.5
        status = 'phishing' if is_phishing else 'legitimate'
        confidence = float(prediction_prob * 100) if is_phishing else float((1 - prediction_prob) * 100)
        reasons = get_phishing_reasons(url_to_check) if is_phishing else []

        prediction_result = {
            'url': url_to_check,
            'status': status,
            'confidence': round(confidence, 2),
            'reasons': reasons
        }

        log_entry = {
            'url': url_to_check,
            'status': prediction_result['status'],
            'confidence': prediction_result.get('confidence'),
            'timestamp': datetime.datetime.utcnow().isoformat() + "Z",
            'userAction': 'blocked' if prediction_result['status'] == 'phishing' else 'allowed',
            'latency_ms': round(latency) # Add latency to the log
        }
        scan_history.append(log_entry)

        return jsonify(prediction_result)

    except Exception as e:
        return jsonify({'error': f'An error occurred during prediction: {str(e)}'}), 500


# --- 5. Dashboard and API Routes (UPDATED) ---
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/data', methods=['GET'])
def get_dashboard_data():
    """Provides all data needed for the pie chart dashboard design."""
    total_scans = len(scan_history)
    blocked_scans = len([item for item in scan_history if item['status'] == 'phishing' and item.get('userAction') != 'proceeded'])
    proceeded_scans = len([item for item in scan_history if item.get('userAction') == 'proceeded'])
    legitimate_scans = total_scans - blocked_scans - proceeded_scans

    # Calculate average latency
    total_latency = sum(item.get('latency_ms', 0) for item in scan_history)
    avg_latency = round(total_latency / total_scans) if total_scans > 0 else 0

    sorted_history = sorted(scan_history, key=lambda x: x['timestamp'], reverse=True)

    return jsonify({
        'history': sorted_history,
        'whitelist': sorted(whitelist),
        'analytics': {
            'total': total_scans,
            'blocked': blocked_scans,
            'proceeded': proceeded_scans,
            'legitimate': legitimate_scans,
            'avg_latency': avg_latency # Add latency to the API response
        }
    })

# --- (Other API routes for whitelist, etc. remain the same) ---
@app.route('/api/whitelist/add', methods=['POST'])
def add_to_whitelist():
    domain = request.json.get('domain')
    if domain and domain not in whitelist:
        whitelist.append(domain)
    return jsonify({'status': 'success', 'whitelist': whitelist})

@app.route('/api/whitelist/remove', methods=['POST'])
def remove_from_whitelist():
    domain = request.json.get('domain')
    if domain and domain in whitelist:
        whitelist.remove(domain)
    return jsonify({'status': 'success', 'whitelist': whitelist})

@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    scan_history.clear()
    return jsonify({'status': 'success'})

@app.route('/api/action/proceeded', methods=['POST'])
def log_proceeded_action():
    data = request.get_json()
    url_to_update = data.get('url')
    if not url_to_update:
        return jsonify({'error': 'URL not provided'}), 400
    
    for entry in reversed(scan_history):
        if entry['url'] == url_to_update:
            entry['userAction'] = 'proceeded'
            break
            
    return jsonify({'status': 'success'})

# --- 6. Cache Control ---
@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# --- 7. Run the Flask App ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
