import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Embedding, Conv1D, Bidirectional, LSTM, Dense, Dropout, Attention, GlobalAveragePooling1D
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
import json

# --- GPU Check ---
print("Checking for GPU availability...")
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        # Use a GPU and set a memory growth limit to avoid pre-allocating all memory
        tf.config.set_visible_devices(gpus[0], 'GPU')
        tf.config.experimental.set_memory_growth(gpus[0], True)
        print("GPU found and configured!")
        print(f"Details: {gpus[0]}")
    except RuntimeError as e:
        print(e)
else:
    print("No GPU found. Training will proceed on CPU.")

# --- 1. Configuration and Hyperparameters (Advanced Model) ---
VOCAB_SIZE = 100         # Number of unique characters to consider
MAX_URL_LENGTH = 200     # Maximum length of a URL to consider
EMBEDDING_DIM = 128      # Dimension for the character embedding vectors
CNN_FILTERS = 128        # Number of filters for the CNN layer
KERNEL_SIZE = 5          # Size of the convolutional kernel
LSTM_UNITS = 64          # Number of units in the LSTM layer
BATCH_SIZE = 128         # Number of samples per batch during training
EPOCHS = 20              # Maximum number of epochs for training

# --- 2. Load and Prepare the Dataset ---
print("Step 1: Loading and preparing the dataset...")

try:
    # This assumes 'dataset_phishing.csv' is in the same folder as the script.
    # TEMPORARY FIX: We are now loading the entire CSV to inspect the columns.
    df = pd.read_csv('dataset_phishing.csv', low_memory=False)
    
    # NEW STEP: Print all column names to the console to find the correct one.
    print("\nColumns found in the CSV file:")
    print(df.columns.tolist())
    
    # You will use the output from the line above to fix the code below.
    # For now, this line is commented out to prevent the error.
    # df = df[['url', 'status']]
    
    # Once you have found the correct name for the 'status' column, you can
    # replace 'status' with the correct name in the line below, uncomment it,
    # and comment out the print statement and the line above it.
    df = df[['url', 'status']] # <-- CHANGE 'status' here to the correct column name
    
    df.dropna(inplace=True)
    print(f"\nDataset loaded successfully with {len(df)} samples.")
except FileNotFoundError:
    print("Error: 'dataset_phishing.csv' not found. Please place it in the same directory.")
    exit()

# --- ADDED: Print the first 5 lines of the dataset ---
print("\nFirst 5 lines of the dataset:")
print(df.head().to_markdown(index=False))

urls = df['url'].values
labels = df['status'].values

# --- 3. Preprocessing: Convert URLs to Numerical Format ---
print("\nStep 2: Preprocessing URLs for the Advanced Model...")

tokenizer = Tokenizer(num_words=VOCAB_SIZE, char_level=True, oov_token='<UNK>')
tokenizer.fit_on_texts(urls)
sequences = tokenizer.texts_to_sequences(urls)
X = pad_sequences(sequences, maxlen=MAX_URL_LENGTH, padding='post', truncating='post')

label_encoder = LabelEncoder()
y = label_encoder.fit_transform(labels)

# --- 4. Split Data into Training and Testing Sets ---
print("\nStep 3: Splitting data into training and testing sets...")
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# --- 5. Build the Advanced BiLSTM + Attention Model Architecture (Improved) ---
print("\nStep 4: Building the Bidirectional LSTM + Attention model architecture...")

# Define the input layer
inputs = Input(shape=(MAX_URL_LENGTH,))

# Embedding Layer
embedding_layer = Embedding(input_dim=VOCAB_SIZE, output_dim=EMBEDDING_DIM, input_length=MAX_URL_LENGTH)(inputs)

# CNN Layer
conv_layer = Conv1D(filters=CNN_FILTERS, kernel_size=KERNEL_SIZE, activation='relu', padding='same')(embedding_layer)

# Bidirectional LSTM Layer
lstm_layer = Bidirectional(LSTM(LSTM_UNITS, return_sequences=True))(conv_layer)

# Attention Layer (Self-Attention)
attention_layer = Attention()([lstm_layer, lstm_layer])

# Pooling Layer to summarize the sequence
pooling_layer = GlobalAveragePooling1D()(attention_layer)

# Dense Layers for Classification with stronger regularization
dense1 = Dense(32, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.001))(pooling_layer)
dropout1 = Dropout(0.6)(dense1)
outputs = Dense(1, activation='sigmoid')(dropout1)

# Create the model
model = Model(inputs=inputs, outputs=outputs)

model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
model.summary()

# --- 6. Train the Model (with Callbacks) ---
print("\nStep 5: Training the advanced model with callbacks...")

# Define callbacks for smarter training
early_stopping = EarlyStopping(monitor='val_loss', patience=2, restore_best_weights=True)
reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=2, min_lr=0.0001)

history = model.fit(
    X_train, y_train,
    batch_size=BATCH_SIZE,
    epochs=EPOCHS,
    validation_data=(X_test, y_test),
    callbacks=[early_stopping, reduce_lr],
    verbose=1
)

# --- 7. Evaluate the Model ---
print("\nStep 6: Evaluating the model performance...")
loss, accuracy = model.evaluate(X_test, y_test, verbose=0)
print(f"\nTest Accuracy: {accuracy * 100:.2f}%")
y_pred_prob = model.predict(X_test)
y_pred = (y_pred_prob > 0.5).astype(int)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=label_encoder.classes_))

# --- ADDED: Print the last 5 predictions ---
print("\nLast 5 predictions vs. true labels:")
# Get the last 5 predicted and true labels
last_5_pred_int = y_pred[-5:].flatten()
last_5_true_int = y_test[-5:].flatten()

# Convert integer labels back to their original class names
last_5_pred_labels = label_encoder.inverse_transform(last_5_pred_int)
last_5_true_labels = label_encoder.inverse_transform(last_5_true_int)

# Create a DataFrame for a clean, readable output
results_df = pd.DataFrame({
    'Actual Label': last_5_true_labels,
    'Predicted Label': last_5_pred_labels
})
print(results_df.to_markdown(index=False))

# --- 8. Save the Trained Model and Preprocessors for Deployment ---
print("\nStep 7: Saving model and tokenizer for deployment...")
model.save('bilstm_attention_model_v2.h5') # Saved as a new version
tokenizer_json = tokenizer.to_json()
with open('tokenizer_bilstm_v2.json', 'w', encoding='utf-8') as f:
    f.write(json.dumps(tokenizer_json, ensure_ascii=False))
np.save('classes_bilstm_v2.npy', label_encoder.classes_)
print("Advanced model, tokenizer, and labels saved successfully.")
