import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="page-shell">
      <div className="auth-card fade-in-up">
        <h1 className="page-title text-2xl mb-1 text-center">Welcome Back</h1>
        <p className="text-sm text-center text-muted-landing mb-6">Sign in to your account</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-mono uppercase tracking-wider text-muted-landing"
                  >
                    Email
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    className="input-landing"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-error">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-mono uppercase tracking-wider text-muted-landing"
                  >
                    Password
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    className="input-landing"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-error">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe>
            {(state) => (
              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={!state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? "Signing in…" : "Sign In"}
              </button>
            )}
          </form.Subscribe>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-sm font-mono hover:underline underline-offset-4 transition-colors text-accent-landing"
          >
            Need an account? Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
