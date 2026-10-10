import { IsArray, IsIn, IsString, MaxLength, ValidateNested, validate } from 'class-validator';
import { Type } from 'class-transformer';
import { fieldErrors, validationException } from './validation-errors.js';

class RuleDto {
  @IsIn(['on', 'off'])
  serve!: string;
}

class FlagDto {
  @IsString()
  @MaxLength(3)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules!: RuleDto[];
}

const build = (input: object): FlagDto => Object.assign(new FlagDto(), input);

describe('fieldErrors', () => {
  it('lists every violated constraint of every field, not only the first', async () => {
    const errors = fieldErrors(await validate(build({ name: 12345, rules: [] })));
    expect(errors.map((e) => e.pointer)).toEqual(['#/name', '#/name']);
    expect(errors.map((e) => e.detail).sort()).toEqual([
      'name must be a string',
      'name must be shorter than or equal to 3 characters',
    ]);
  });

  it('points into nested objects and array items with JSON Pointers (RFC 6901)', async () => {
    const rule = Object.assign(new RuleDto(), { serve: 'maybe' });
    const errors = fieldErrors(await validate(build({ name: 'ab', rules: [rule] })));
    expect(errors).toEqual([
      { pointer: '#/rules/0/serve', detail: 'serve must be one of the following values: on, off' },
    ]);
  });

  it('escapes ~ and / in a property name', () => {
    const errors = fieldErrors([
      { property: 'a/b~c', constraints: { isString: 'x' }, children: [] },
    ]);
    expect(errors).toEqual([{ pointer: '#/a~1b~0c', detail: 'x' }]);
  });
});

describe('validationException', () => {
  it('is a 400 with a code, a summary and the field errors', async () => {
    const exception = validationException(await validate(build({ name: 'abcd', rules: [] })));
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ pointer: '#/name' }],
    });
  });
});
