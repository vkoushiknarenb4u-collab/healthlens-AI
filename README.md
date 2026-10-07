# HealthLens AI

HealthLens AI is a local web app that reads a blood-test PDF with Gemini, validates the response as structured data, and presents the extracted results in a responsive dashboard. It includes result explanations, printed reference ranges, a report-grounded chat, and an optional kidney screening model.

> **Medical disclaimer:** This tool is for educational and informational purposes only. It does not provide a medical diagnosis or replace professional medical advice. Please consult a qualified healthcare professional for interpretation of your results and medical decisions.

## Run locally

Requirements: Node.js 20 or newer and a Gemini API key. Python 3 is optional unless you want to train the kidney screening model.

1. Install the JavaScript packages:

   ```sh
   npm install
   ```

2. To enable the optional ML training pipeline, install its Python packages into the project-local directory:

   ```sh
   py -3 -m pip install --upgrade --target ml/.python-packages -r ml/requirements.txt
   ```

3. Copy `.env.example` to `.env` and add your key from [Google AI Studio](https://aistudio.google.com/app/apikey):

   ```text
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-3.5-flash-lite
   PORT=3000
   ```

   Keep `.env` private. The key is read by the Node server and is never sent to the browser.

4. Start the app:

   ```sh
   npm start
   ```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000), select a PDF blood report, and choose **Analyze my report**.

The server accepts one PDF up to 15 MB. It checks the extension, MIME type, and PDF signature. If the Gemini key is missing or the API cannot be reached, the page shows an actionable error.

## What the app does

- Uploads a PDF with visible progress and checks its file type and size in the browser and server.
- Sends PDF bytes to Gemini as inline document data. The prompt asks Gemini to copy only legible values and printed ranges, return JSON, and mark unclear values unavailable.
- Validates Gemini's result with Zod before it reaches the dashboard. Abnormal results are derived from the validated test list.
- Shows the report summary, normal and abnormal counts, findings, risk availability, detailed results, plain-language explanations, suggestions, and doctor questions.
- Answers report questions using the extracted report held by a short-lived server session. Chat responses are not stored.

The app does not parse PDF text itself; Gemini reads the document. When the source is unclear or the output does not match the required schema, the app reports an error instead of attempting to fill in missing values.

## Privacy and data handling

- The PDF is held in server memory for the duration of analysis. The app does not write uploaded files to disk.
- The PDF is sent to Google's Gemini API over HTTPS for analysis. This app does not control Google's processing or retention; review the terms and privacy rules that apply to your API account before sending medical information.
- The extracted report is kept in server memory for the report chat and expires after one hour. **Analyze another report** removes the current session. No report data is written to a database, log, cookie, or browser storage.
- The browser keeps the current report in page memory while its dashboard is open. Reloading or closing the tab clears that local state.
- The app does not include user accounts, analytics, or third-party chat services.

## Risk model

The risk area does not turn an isolated lab value into a disease claim. It shows **Insufficient data** when the relevant model is not installed or any required feature is absent.

### Optional kidney screening baseline

`ml/train_kidney_model.py` trains an experimental logistic-regression classifier from the [UCI Chronic Kidney Disease dataset](https://archive.ics.uci.edu/dataset/336/chronic). UCI describes 400 records and 24 input features collected in a hospital setting over about two months. The dataset includes laboratory values and clinical fields; its target is the dataset's CKD / not-CKD class. It is a small historical dataset and is not a prospective risk study or a clinically validated model.

The script uses these 24 columns:

- Numeric: age, blood pressure, specific gravity, urine albumin and sugar levels, random blood glucose, blood urea, serum creatinine, sodium, potassium, hemoglobin, packed cell volume, white-cell count, and red-cell count.
- Categorical: urine red cells, pus cells, pus-cell clumps, bacteria, hypertension, diabetes, coronary artery disease, appetite, pedal edema, and anemia.

Training preprocessing replaces source `?` values with missing data, coerces numeric columns, imputes training-set numeric medians and categorical modes, standardizes numeric columns, and one-hot encodes categorical fields. It uses a stratified 80/20 holdout split with `random_state=42`, then fits class-weighted logistic regression. The script computes accuracy, precision, recall, F1, and ROC-AUC on the held-out records and saves the measured values with the model artifact. Metrics are generated at training time rather than hardcoded or presented as clinical performance.

To generate the optional model:

```sh
py -3 -m pip install --upgrade --target ml/.python-packages -r ml/requirements.txt
npm run train:kidney
```

The training command downloads the dataset through the UCI repository client and writes `ml/models/kidney.json`. Restart the Node server after training so it loads the model. The model is excluded from Git because it is a generated artifact. The repository includes the training code and dataset citation, not the dataset itself.

The app maps exact test names and compatible units only. Prediction is enabled only when all 24 model inputs are present in the uploaded report; missing values are never imputed at prediction time. In practice, a routine blood panel will usually omit clinical and urine features, so the dashboard will normally say **Insufficient data**. The model score is not calibrated, externally validated, or a measure of future disease risk. A model category is a screening signal only, not a diagnosis. The other listed condition modules remain unavailable until a relevant dataset, validated model, complete feature mapping, and model report are added.

## Project layout

```text
public/                  Responsive dashboard and upload flow
server/index.js          HTTP routes, upload validation, in-memory sessions
server/gemini.js         Gemini extraction and report chat
server/report-schema.js  Structured output schema and validation
server/risk-engine.js    Exact-feature mapping and optional model inference
ml/train_kidney_model.py Reproducible model training and metrics export
```

## Troubleshooting

- **Gemini is not configured:** copy `.env.example` to `.env`, add `GEMINI_API_KEY`, and restart the server.
- **PDF upload is rejected:** confirm it is a real PDF, smaller than 15 MB, and not password protected.
- **No values are found:** try a text-based or higher quality PDF. The app will not guess values from an unreadable report.
- **Risk cards say insufficient data:** this is expected until the optional model is trained and every required input is explicitly found in the report.
- **The model file is not picked up:** restart the Node process after running the training command.

## References

- Google Gemini PDF input and structured output documentation: [Document processing](https://ai.google.dev/gemini-api/docs/document-processing), [Structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- Rubini, L., Soundarapandian, P., & Eswaran, P. (2015). *Chronic Kidney Disease*. UCI Machine Learning Repository. [Dataset record and license](https://archive.ics.uci.edu/dataset/336/chronic)
