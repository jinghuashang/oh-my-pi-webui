import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import {
  CloneProjectDto,
  CreateProjectDto,
  CreateProjectResponseDto,
  ProjectsListResponseDto,
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Lists projects stored under the data/projects directory and returns the base path.
   */
  @Get()
  @ApiOperation({ summary: 'List projects created under data/projects' })
  @ApiOkResponse({ type: ProjectsListResponseDto })
  async listProjects(): Promise<ProjectsListResponseDto> {
    return this.projectsService.listProjects();
  }

  /**
   * Creates a new project directory under data/projects, initializes git,
   * registers the workspace root, and creates the initial session thread!
   */
  @Post()
  @ApiOperation({
    summary: 'Create a new project directory under data/projects and start initial session thread',
  })
  @ApiCreatedResponse({ type: CreateProjectResponseDto })
  async createProject(
    @Body() body: CreateProjectDto,
  ): Promise<CreateProjectResponseDto> {
    return this.projectsService.createProject(body);
  }

  /**
   * Clones a GitHub repository into data/projects/<projectName>, registers workspace root,
   * and creates an initial session thread!
   */
  @Post('clone')
  @ApiOperation({
    summary: 'Clone a GitHub repository into data/projects and start initial session thread',
  })
  @ApiCreatedResponse({ type: CreateProjectResponseDto })
  async cloneProject(
    @Body() body: CloneProjectDto,
  ): Promise<CreateProjectResponseDto> {
    return this.projectsService.cloneProject(body);
  }
}
