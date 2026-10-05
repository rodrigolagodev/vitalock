import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate } from 'react-router-dom';
import { Button, FormField, Input, PasswordInput } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';

const schema = z.object({
  email: z.string().trim().email('Email inválido'),
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
    await signIn(data.email, data.password);
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
          <FormField label="Email" id="email" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register('email')}
            />
          </FormField>

          <FormField label="Contraseña" id="password" error={errors.password?.message}>
            <PasswordInput autoComplete="current-password" {...register('password')} />
          </FormField>

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
