import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { MAX_PASSWORD_BYTES } from '../../../common/utils/password.js';
import { MaxBytes } from '../../../common/validators/max-bytes.validator.js';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsNotEmpty()
  @MaxBytes(MAX_PASSWORD_BYTES)
  password!: string;
}
