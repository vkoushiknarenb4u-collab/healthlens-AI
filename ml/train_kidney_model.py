"""Train a baseline CKD classifier from UCI dataset 336 and export a JSON model.

The exported model is a research/demo screening baseline. It is not a clinical
model and is not intended to diagnose or estimate future disease risk.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Use the project-local dependency install when available. This keeps the ML
# packages isolated from unrelated Python packages on the machine.
LOCAL_PYTHON_PACKAGES = Path(__file__).resolve().parent / ".python-packages"
if LOCAL_PYTHON_PACKAGES.is_dir():
    sys.path.insert(0, str(LOCAL_PYTHON_PACKAGES))

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from ucimlrepo import fetch_ucirepo


NUMERIC_FEATURES = ["age", "bp", "sg", "al", "su", "bgr", "bu", "sc", "sod", "pot", "hemo", "pcv", "wc", "rc"]
CATEGORICAL_FEATURES = ["rbc", "pc", "pcc", "ba", "htn", "dm", "cad", "appet", "pe", "ane"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
MODEL_DIRECTORY = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIRECTORY / "kidney.json"


def clean_dataset() -> tuple[pd.DataFrame, pd.Series]:
    dataset = fetch_ucirepo(id=336)
    features = dataset.data.features.copy()
    target = dataset.data.targets.iloc[:, 0].astype("string").str.strip().str.lower()

    # Keep the model contract fixed and explicit even if the repository adds columns.
    features.columns = [str(column).strip().lower() for column in features.columns]
    features = features.reindex(columns=ALL_FEATURES)
    for column in ALL_FEATURES:
        if features[column].dtype == object or str(features[column].dtype).startswith("string"):
            features[column] = features[column].astype("string").str.strip().str.lower()
            features[column] = features[column].replace({"?": pd.NA, "\\t?": pd.NA, "": pd.NA})

    for column in NUMERIC_FEATURES:
        features[column] = pd.to_numeric(features[column], errors="coerce")

    labels = target.map({"ckd": 1, "notckd": 0})
    keep = labels.notna()
    return features.loc[keep].reset_index(drop=True), labels.loc[keep].astype(int).reset_index(drop=True)


def main() -> None:
    features, labels = clean_dataset()
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.20,
        stratify=labels,
        random_state=42,
    )

    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    preprocessing = ColumnTransformer([
        ("num", numeric_pipeline, NUMERIC_FEATURES),
        ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
    ])
    classifier = Pipeline([
        ("preprocessing", preprocessing),
        ("model", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
    ])
    classifier.fit(x_train, y_train)

    predicted = classifier.predict(x_test)
    probabilities = classifier.predict_proba(x_test)[:, 1]
    metrics = {
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "accuracy": float(accuracy_score(y_test, predicted)),
        "precision": float(precision_score(y_test, predicted, zero_division=0)),
        "recall": float(recall_score(y_test, predicted, zero_division=0)),
        "f1": float(f1_score(y_test, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "split": "stratified 80/20 holdout, random_state=42",
    }

    fitted_preprocessing = classifier.named_steps["preprocessing"]
    fitted_numeric = fitted_preprocessing.named_transformers_["num"]
    fitted_categorical = fitted_preprocessing.named_transformers_["cat"]
    fitted_classifier = classifier.named_steps["model"]
    scaler = fitted_numeric.named_steps["scaler"]
    imputer = fitted_numeric.named_steps["imputer"]
    encoder = fitted_categorical.named_steps["encoder"]

    model = {
        "model_name": "healthlens-kidney-logistic-v1",
        "dataset": "Chronic Kidney Disease, UCI Machine Learning Repository dataset 336 (400 records)",
        "target_positive": "ckd",
        "features": ALL_FEATURES,
        "numeric": {
            name: {
                "median": float(imputer.statistics_[index]),
                "mean": float(scaler.mean_[index]),
                "scale": float(scaler.scale_[index]),
            }
            for index, name in enumerate(NUMERIC_FEATURES)
        },
        "categorical": {
            name: [str(value) for value in encoder.categories_[index]]
            for index, name in enumerate(CATEGORICAL_FEATURES)
        },
        "intercept": float(fitted_classifier.intercept_[0]),
        "coefficients": [float(value) for value in fitted_classifier.coef_[0]],
        "metrics": metrics,
        "limitations": [
            "The source dataset contains 400 records collected in one hospital setting over about two months.",
            "The model predicts the dataset's CKD class; it is not a prospective risk model and is not externally validated.",
            "Prediction is disabled unless every model input is explicitly present in the uploaded report.",
            "The holdout metrics are educational measurements, not evidence of clinical utility.",
        ],
    }

    if len(model["coefficients"]) != len(NUMERIC_FEATURES) + sum(len(values) for values in model["categorical"].values()):
        raise RuntimeError("Exported model dimensions do not match the preprocessing pipeline.")

    MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model, indent=2), encoding="utf-8")
    print(json.dumps({"model": str(MODEL_PATH), "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
