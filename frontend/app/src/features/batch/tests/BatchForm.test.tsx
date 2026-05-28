import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchForm } from '../components/BatchForm';

describe('BatchForm Component', () => {
  const mockOnExecuteBatch = vi.fn();
  const mockOnSkipToAnalysis = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all inputs and action buttons correctly', () => {
    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={null}
      />
    );

    expect(screen.getByLabelText(/Batch Variable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Covariates/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Batch$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip/i })).toBeInTheDocument();
  });

  it('triggers local validation error if batch variable is empty on submit', () => {
    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={null}
      />
    );

    const batchButton = screen.getByRole('button', { name: /^Batch$/i });
    fireEvent.click(batchButton);

    expect(screen.getByText(/Please provide a batch variable/i)).toBeInTheDocument();
    expect(mockOnExecuteBatch).not.toHaveBeenCalled();
  });

  it('prevents using the batch variable inside the covariates input field', () => {
    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={null}
      />
    );

    const batchInput = screen.getByLabelText(/Batch Variable/i);
    const covInput = screen.getByLabelText(/Covariates/i);
    const batchButton = screen.getByRole('button', { name: /^Batch$/i });

    fireEvent.change(batchInput, { target: { value: 'Slide' } });
    fireEvent.change(covInput, { target: { value: 'Age, Slide, Group' } });
    fireEvent.click(batchButton);

    expect(screen.getByText(/The batch variable cannot be used as a covariate/i)).toBeInTheDocument();
    expect(mockOnExecuteBatch).not.toHaveBeenCalled();
  });

  it('successfully parses and maps FastAPI 422 validation array errors to correct inputs', () => {
    const mock422Error = {
      detail: [
        { loc: ['body', 'batch_correction', 'batch_variable'], msg: 'Field required' },
        { loc: ['body', 'batch_correction', 'covariates'], msg: 'Invalid format' }
      ]
    };

    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={mock422Error}
      />
    );

    expect(screen.getByText(/Invalid input: Field required/i)).toBeInTheDocument();
    expect(screen.getByText(/Invalid input: Invalid format/i)).toBeInTheDocument();
  });

  it('successfully parses FastAPI 400 string detail errors and maps them dynamically', () => {
    const mock400Error = {
      detail: "The batch variable 'WrongColumn' was not found in the SampleSheet."
    };

    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={mock400Error}
      />
    );

    // Sollte unter dem Batch-Feld landen, da die Meldung "variable" enthält
    expect(screen.getByText(/The batch variable 'WrongColumn' was not found/i)).toBeInTheDocument();
  });

  it('displays the yellow available columns infobox when backend provides sample sheet data', () => {
    const mockErrorWithDetails = {
      detail: 'Validation failed',
      message: 'Some columns are missing',
      error: 'COLUMN_MISSING',
      detail_info: { available: ['Slide', 'Array', 'Age', 'Diagnosis'] } // Entspricht backendError.detail?.available
    };
    
    // Kleiner Trick, falls dein Interface "detail.available" verschachtelt hat:
    const formattedError = {
      ...mockErrorWithDetails,
      detail: { available: ['Slide', 'Array', 'Age', 'Diagnosis'] }
    };

    render(
      <BatchForm
        onExecuteBatch={mockOnExecuteBatch}
        onSkipToAnalysis={mockOnSkipToAnalysis}
        disabled={false}
        backendError={formattedError}
      />
    );

    expect(screen.getByText(/Available columns in SampleSheet:/i)).toBeInTheDocument();
    expect(screen.getByText(/Slide, Array, Age, Diagnosis/i)).toBeInTheDocument();
  });
});