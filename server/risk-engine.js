import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODEL_PATH = fileURLToPath(new URL('../ml/models/kidney.json', import.meta.url));
const NUMERIC_FEATURES = ['age', 'bp', 'sg', 'al', 'su', 'bgr', 'bu', 'sc', 'sod', 'pot', 'hemo', 'pcv', 'wc', 'rc'];
const CATEGORICAL_FEATURES = ['rbc', 'pc', 'pcc', 'ba', 'htn', 'dm', 'cad', 'appet', 'pe', 'ane'];

function loadModel() {
  try {
    const model = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
    return model.model_name === 'healthlens-kidney-logistic-v1' ? model : null;
  } catch {
    return null;
  }
}

const kidneyModel = loadModel();

function normalized(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function numericValue(test, target) {
  const name = normalized(test.name);
  const unit = normalized(test.unit);
  if (typeof test.value !== 'number' || !Number.isFinite(test.value)) return null;
  const matches = {
    age: /^(age|patient age)$/,
    bp: /^(blood pressure|bp)$/,
    sg: /^(urine specific gravity|specific gravity)$/,
    al: /^(urine albumin|urine albumin level|albumin (urine))$/,
    su: /^(urine sugar|urine glucose|urine sugar level)$/,
    bgr: /^(random blood glucose|blood glucose random|random glucose)$/,
    bu: /^(blood urea|urea)$/,
    sc: /^(serum creatinine|creatinine)$/,
    sod: /^(sodium)$/,
    pot: /^(potassium)$/,
    hemo: /^(hemoglobin|haemoglobin)$/,
    pcv: /^(packed cell volume|hematocrit|haematocrit|pcv)$/,
    wc: /^(white blood cell count|wbc count|wbc)$/,
    rc: /^(red blood cell count|rbc count|rbc)$/
  };
  if (!matches[target]?.test(name)) return null;

  // Model feature units are taken from the UCI dataset. Convert only common,
  // unambiguous units; otherwise leave the feature missing.
  if (target === 'sc' && /^(umol\/l|\u00b5mol\/l|\u03bcmol\/l)$/.test(unit)) return test.value / 88.4;
  if (target === 'bgr' && /^(mmol\/l)$/.test(unit)) return test.value * 18.0182;
  if (target === 'hemo' && /^(g\/l)$/.test(unit)) return test.value / 10;
  if (target === 'sod' || target === 'pot') {
    if (unit && !/^(mmol\/l|meq\/l)$/.test(unit)) return null;
  }
  if (target === 'bp' && unit && !/^(mmhg)$/.test(unit)) return null;
  if (target === 'bu' && unit && !/^(mg\/dl|mg\/100 ?ml)$/.test(unit)) return null;
  if (target === 'sc' && unit && !/^(mg\/dl|mg\/100 ?ml|umol\/l|\u00b5mol\/l|\u03bcmol\/l)$/.test(unit)) return null;
  if (target === 'bgr' && unit && !/^(mg\/dl|mg\/100 ?ml|mmol\/l)$/.test(unit)) return null;
  if (target === 'hemo' && unit && !/^(g\/dl|g\/100 ?ml|g\/l)$/.test(unit)) return null;
  if (target === 'pcv' && unit && !/^(%|percent)$/.test(unit)) return null;
  if (target === 'wc' && unit && !/^(cells\/cumm|cells\/mm3|cells\/ul|\/mm3|\/ul)$/.test(unit)) return null;
  if (target === 'rc' && unit && !/^(million\/cmm|million\/mm3|10\^6\/ul|10\^6\/mm3|millions\/cmm)$/.test(unit)) return null;
  if (target === 'age' && unit && !/^(years?|yr|yrs)$/.test(unit)) return null;
  if (target === 'bp' && /systolic|diastolic/.test(name)) return null;
  if ((target === 'sg' || target === 'al' || target === 'su') && !/urine/.test(name)) return null;
  return test.value;
}

function categoricalValue(tests, target) {
  const aliases = {
    rbc: /^(urine rbc|urine red blood cells|rbc morphology)$/,
    pc: /^(urine pus cell|pus cells (urine)|urine pus cells)$/,
    pcc: /^(urine pus cell clumps|pus cell clumps)$/,
    ba: /^(urine bacteria|bacteria (urine))$/,
    htn: /^(hypertension|high blood pressure)$/,
    dm: /^(diabetes mellitus|diabetes history)$/,
    cad: /^(coronary artery disease|cad)$/,
    appet: /^(appetite)$/,
    pe: /^(pedal edema|pedal oedema)$/,
    ane: /^(anemia|anaemia)$/
  };
  const test = tests.find((candidate) => aliases[target]?.test(normalized(candidate.name)));
  if (!test) return null;
  const text = normalized(test.qualitative_value && test.qualitative_value !== 'Unavailable' ? test.qualitative_value : '');
  const status = normalized(test.status);
  if (target === 'htn' || target === 'dm' || target === 'cad' || target === 'pe' || target === 'ane' || target === 'pcc' || target === 'ba') {
    if (['yes', 'present', 'positive', 'true', '1'].includes(text)) return 'yes';
    if (['no', 'absent', 'negative', 'false', '0'].includes(text)) return 'no';
  }
  if (target === 'appet' && ['good', 'poor'].includes(text)) return text;
  if ((target === 'rbc' || target === 'pc') && ['normal', 'abnormal'].includes(text)) return text;
  if ((target === 'rbc' || target === 'pc') && status === 'normal') return 'normal';
  if ((target === 'rbc' || target === 'pc') && ['low', 'high', 'abnormal'].includes(status)) return 'abnormal';
  return null;
}

function collectFeatures(tests, patientInformation) {
  const features = {};
  const age = String(patientInformation?.age || '').match(/^\s*(\d{1,3})(?:\s*(?:years?|yrs?))?\s*$/i);
  if (age) features.age = Number(age[1]);
  for (const feature of NUMERIC_FEATURES) {
    if (feature === 'age' && features.age !== undefined) continue;
    const matched = tests.map((test) => numericValue(test, feature)).find((value) => value !== null);
    if (matched !== undefined) features[feature] = matched;
  }
  for (const feature of CATEGORICAL_FEATURES) {
    const matched = categoricalValue(tests, feature);
    if (matched !== null) features[feature] = matched;
  }
  return features;
}

function missingFeatures(features) {
  return [...NUMERIC_FEATURES, ...CATEGORICAL_FEATURES].filter((name) => features[name] === undefined);
}

function displayFeature(name) {
  return ({
    age: 'age', bp: 'blood pressure', sg: 'urine specific gravity', al: 'urine albumin level', su: 'urine sugar level',
    bgr: 'random blood glucose', bu: 'blood urea', sc: 'serum creatinine', sod: 'sodium', pot: 'potassium',
    hemo: 'hemoglobin', pcv: 'packed cell volume', wc: 'white blood cell count', rc: 'red blood cell count',
    rbc: 'urine red blood cell finding', pc: 'urine pus cell finding', pcc: 'urine pus cell clumps', ba: 'urine bacteria',
    htn: 'hypertension history', dm: 'diabetes history', cad: 'coronary artery disease history', appet: 'appetite',
    pe: 'pedal edema', ane: 'anemia history'
  })[name] || name;
}

function inferKidney(features) {
  if (!kidneyModel) return null;
  const encoded = [];
  for (const name of NUMERIC_FEATURES) {
    const stats = kidneyModel.numeric[name];
    const value = features[name];
    if (!stats || typeof value !== 'number') return null;
    const imputed = Number.isFinite(value) ? value : stats.median;
    encoded.push((imputed - stats.mean) / (stats.scale || 1));
  }
  for (const name of CATEGORICAL_FEATURES) {
    const categories = kidneyModel.categorical[name];
    if (!Array.isArray(categories)) return null;
    const value = String(features[name]);
    for (const category of categories) encoded.push(category === value ? 1 : 0);
  }
  if (encoded.length !== kidneyModel.coefficients.length) return null;
  const logit = kidneyModel.intercept + encoded.reduce((sum, value, index) => sum + value * kidneyModel.coefficients[index], 0);
  const probability = logit >= 0 ? 1 / (1 + Math.exp(-logit)) : Math.exp(logit) / (1 + Math.exp(logit));
  return { probability, metrics: kidneyModel.metrics };
}

export function assessRisks(tests, patientInformation) {
  const features = collectFeatures(tests, patientInformation);
  const missing = missingFeatures(features);
  const prediction = missing.length ? null : inferKidney(features);
  const kidneyRisk = prediction ? {
    name: 'Kidney function',
    category: prediction.probability >= 0.5 ? 'ELEVATED' : 'LOW',
    basis: `An experimental classifier placed this complete set of features in its ${prediction.probability >= 0.5 ? 'CKD' : 'not-CKD'} class. It reflects a small historical dataset, is not calibrated for future risk, and cannot diagnose.`,
    missing_data: []
  } : {
    name: 'Kidney function',
    category: 'INSUFFICIENT_DATA',
    basis: kidneyModel ? 'The report does not contain every feature required by this screening model.' : 'No trained kidney screening model is installed.',
    missing_data: kidneyModel ? missing.map(displayFeature) : []
  };

  return [
    {
      name: 'Diabetes', category: 'INSUFFICIENT_DATA',
      basis: 'No validated diabetes model is installed. Glucose or HbA1c results alone are not a model-based risk estimate.',
      missing_data: []
    },
    {
      name: 'Anemia', category: 'INSUFFICIENT_DATA',
      basis: 'No validated anemia prediction model is installed. A low blood count alone does not establish a cause.',
      missing_data: []
    },
    {
      name: 'Cardiovascular', category: 'INSUFFICIENT_DATA',
      basis: 'No validated cardiovascular model is installed. Blood results alone do not provide a complete estimate.',
      missing_data: []
    },
    kidneyRisk,
    {
      name: 'Liver function', category: 'INSUFFICIENT_DATA',
      basis: 'No validated liver prediction model is installed. Individual liver tests need clinical context.',
      missing_data: []
    }
  ];
}
