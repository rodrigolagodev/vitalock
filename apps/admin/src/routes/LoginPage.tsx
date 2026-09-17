import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate } from 'react-router-dom';
import { Button, Input, PasswordInput } from '@vitalock/ui';
import { useAuthContext, usernameSchema } from '@vitalock/shared';

const schema = z.object({
  username: usernameSchema,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { signIn, phase, error } = useAuthContext();
  const isPending = phase === 'authenticating' || phase === 'fetching_profile';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    await signIn(data.username, data.password);
  };

  if (phase === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Vitalock Admin</h1>
          <p className="text-muted-foreground text-sm">Ingresá con tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="username" className="text-sm font-medium">
              Usuario
            </label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register('username')}
            />
            {errors.username && (
              <p className="text-destructive text-xs">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-destructive text-xs">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
