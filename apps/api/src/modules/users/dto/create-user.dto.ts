import { IsEmail, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from '../../../common/utils/password.js';
import { MaxBytes } from '../../../common/validators/max-bytes.validator.js';

/** There is deliberately no `role` field: users created through the API are always viewers. */
export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxBytes(MAX_PASSWORD_BYTES)
  password!: string;
}
