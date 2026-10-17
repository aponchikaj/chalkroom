// lane C: course catalog, course pages, fork, ratings, FAQ, the lobby of public rooms: HTTP routes.
import { Controller } from '@nestjs/common';
import { CoursesService } from './courses.service';

@Controller()
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}
}
