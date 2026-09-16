import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import { OmpFeedbackController } from './codex-feedback.controller';

describe('OmpFeedbackController', () => {
  const codex = {
    request: vi.fn(),
  };
  let controller: OmpFeedbackController;

  beforeEach(() => {
    vi.clearAllMocks();
    codex.request.mockResolvedValue({ threadId: 'feedback-thread' });
    controller = new OmpFeedbackController(codex as never);
  });

  it('uploads feedback with logs disabled by default', async () => {
    await controller.uploadFeedback({
      classification: 'bug',
      reason: '  failed review  ',
      threadId: ' thread-1 ',
    });

    expect(codex.request).toHaveBeenCalledWith('feedback/upload', {
      classification: 'bug',
      reason: 'failed review',
      threadId: 'thread-1',
      includeLogs: false,
    });
  });

  it('passes explicit includeLogs and string tags', async () => {
    await controller.uploadFeedback({
      classification: 'bug',
      includeLogs: true,
      tags: { source: 'slash' },
    });

    expect(codex.request).toHaveBeenCalledWith('feedback/upload', {
      classification: 'bug',
      includeLogs: true,
      tags: { source: 'slash' },
    });
  });

  it('rejects missing classification', () => {
    expectBusinessError(
      () => controller.uploadFeedback({ classification: '   ' }),
      ErrorCode.codex.invalidFeedback,
    );
  });

  it('rejects non-boolean includeLogs', () => {
    expectBusinessError(
      () =>
        controller.uploadFeedback({
          classification: 'bug',
          includeLogs: 'yes',
        } as never),
      ErrorCode.validation.typeMismatch,
    );
  });
});

function expectBusinessError(action: () => unknown, errorCode: string): void {
  try {
    action();
  } catch (err) {
    expect(err).toBeInstanceOf(BusinessException);
    expect(err).toMatchObject({ errorCode });
    return;
  }
  throw new Error(`Expected ${errorCode}`);
}
