import { Test, TestingModule } from '@nestjs/testing';
import { OmpService } from './omp-engine.service';
import { OmpProcessManager } from './omp-process-manager.service';

describe('OmpService', () => {
  let service: OmpService;
  const mockClient = {
    request: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OmpService,
        {
          provide: OmpProcessManager,
          useValue: { getClient: () => mockClient },
        },
      ],
    }).compile();

    service = module.get(OmpService);
    mockClient.request.mockReset();
  });

  it('should delegate request to client', async () => {
    mockClient.request.mockResolvedValue({ data: [] });
    const result = await service.request('model/list', {});
    expect(result).toEqual({ data: [] });
    expect(mockClient.request).toHaveBeenCalledWith('model/list', {});
  });

  it('should throw when client is not connected', () => {
    const disconnectedService = new OmpService({
      getClient: () => null,
    } as unknown as OmpProcessManager);

    expect(() => disconnectedService.getClient()).toThrow(
      'OMP engine is not connected',
    );
  });
});
