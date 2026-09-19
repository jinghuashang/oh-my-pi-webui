import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import {
  CloneProjectDto,
  CreateProjectDto,
  CreateProjectResponseDto,
  DeleteProjectResponseDto,
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

  /**
   * Deletes a project from data/projects (or /workspaces).
   * Optionally removes the local directory on disk.
   */
  @Delete(':name')
  @ApiOperation({
    summary: 'Delete a project and optionally remove its local directory from disk',
  })
  @ApiQuery({
    name: 'deleteDirectory',
    required: false,
    type: Boolean,
    description: 'Whether to permanently remove the project directory from disk',
  })
  @ApiOkResponse({ type: DeleteProjectResponseDto })
  async deleteProject(
    @Param('name') name: string,
    @Query('deleteDirectory') deleteDirectory?: string,
  ): Promise<DeleteProjectResponseDto> {
    return this.projectsService.deleteProject(
      name,
      deleteDirectory === 'true' || deleteDirectory === '1',
    );
  }
}
