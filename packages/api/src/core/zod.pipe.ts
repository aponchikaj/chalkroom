// Validates a request body against a schema from @chalk/schema.
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodPipe<S extends z.ZodType> implements PipeTransform {
  constructor(private schema: S) {}
  transform(value: unknown): z.infer<S> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    return r.data;
  }
}
