import { z } from 'zod';

const unavailable = z.string().default('Unavailable');

export const testSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.number().finite().nullable(),
  qualitative_value: unavailable,
  unit: unavailable,
  reference_range: unavailable,
  status: z.enum(['NORMAL', 'LOW', 'HIGH', 'BORDERLINE', 'UNAVAILABLE']),
  explanation: z.object({
    what_it_measures: z.string().default(''),
    potential_meaning: z.string().default(''),
    common_factors: z.array(z.string()).default([]),
    discuss_with_doctor: z.string().default('')
  }).default({})
});

export const riskSchema = z.object({
  name: z.string(),
  category: z.enum(['LOW', 'MODERATE', 'ELEVATED', 'INSUFFICIENT_DATA']),
  basis: z.string(),
  missing_data: z.array(z.string()).default([]),
  score: z.number().min(0).max(1).optional()
});

export const reportSchema = z.object({
  patient_information: z.object({
    name: unavailable,
    age: unavailable,
    sex: unavailable,
    report_date: unavailable,
    clinician: unavailable
  }),
  tests: z.array(testSchema),
  abnormal_tests: z.array(testSchema).default([]),
  summary: z.string(),
  possible_risks: z.array(riskSchema).default([]),
  missing_data: z.array(z.string()).default([]),
  questions_to_discuss_with_doctor: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([])
});

export const geminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    patient_information: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        age: { type: 'STRING' },
        sex: { type: 'STRING' },
        report_date: { type: 'STRING' },
        clinician: { type: 'STRING' }
      },
      required: ['name', 'age', 'sex', 'report_date', 'clinician']
    },
    tests: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          value: { type: ['NUMBER', 'NULL'] },
          qualitative_value: { type: 'STRING' },
          unit: { type: 'STRING' },
          reference_range: { type: 'STRING' },
          status: { type: 'STRING', enum: ['NORMAL', 'LOW', 'HIGH', 'BORDERLINE', 'UNAVAILABLE'] },
          explanation: {
            type: 'OBJECT',
            properties: {
              what_it_measures: { type: 'STRING' },
              potential_meaning: { type: 'STRING' },
              common_factors: { type: 'ARRAY', items: { type: 'STRING' } },
              discuss_with_doctor: { type: 'STRING' }
            },
            required: ['what_it_measures', 'potential_meaning', 'common_factors', 'discuss_with_doctor']
          }
        },
        required: ['name', 'value', 'qualitative_value', 'unit', 'reference_range', 'status', 'explanation']
      }
    },
    abnormal_tests: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          value: { type: ['NUMBER', 'NULL'] },
          qualitative_value: { type: 'STRING' },
          unit: { type: 'STRING' },
          reference_range: { type: 'STRING' },
          status: { type: 'STRING', enum: ['NORMAL', 'LOW', 'HIGH', 'BORDERLINE', 'UNAVAILABLE'] },
          explanation: {
            type: 'OBJECT',
            properties: {
              what_it_measures: { type: 'STRING' },
              potential_meaning: { type: 'STRING' },
              common_factors: { type: 'ARRAY', items: { type: 'STRING' } },
              discuss_with_doctor: { type: 'STRING' }
            },
            required: ['what_it_measures', 'potential_meaning', 'common_factors', 'discuss_with_doctor']
          }
        },
        required: ['name', 'value', 'qualitative_value', 'unit', 'reference_range', 'status', 'explanation']
      }
    },
    summary: { type: 'STRING' },
    possible_risks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          category: { type: 'STRING', enum: ['LOW', 'MODERATE', 'ELEVATED', 'INSUFFICIENT_DATA'] },
          basis: { type: 'STRING' },
          missing_data: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['name', 'category', 'basis', 'missing_data']
      }
    },
    missing_data: { type: 'ARRAY', items: { type: 'STRING' } },
    questions_to_discuss_with_doctor: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: [
    'patient_information', 'tests', 'abnormal_tests', 'summary', 'possible_risks',
    'missing_data', 'questions_to_discuss_with_doctor', 'suggestions'
  ]
};
