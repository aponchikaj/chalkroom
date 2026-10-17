// lane L: replays of finished classes, booking the next session, kudos: HTTP routes.
import { Controller } from '@nestjs/common';
import { LibraryService } from './library.service';

@Controller()
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}
}
