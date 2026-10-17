// lane M: live activities in a class: quiz duel and teach-back: HTTP routes.
import { Controller } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

@Controller()
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}
}
