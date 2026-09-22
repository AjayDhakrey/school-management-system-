import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { useAuth, DASHBOARD_PATH_FOR_ROLE } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

const DEMO_PASSWORD = "password123";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "superadmin@example.com" },
  { role: "School Admin", email: "everbright.admin@example.com" },
  { role: "Teacher", email: "everbright.teacher@example.com" },
  { role: "Staff (Admin dept)", email: "everbright.staff@example.com" },
  { role: "Parent", email: "everbright.parent@example.com" },
  { role: "Student", email: "everbright.student@example.com" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      const fallback = DASHBOARD_PATH_FOR_ROLE[user.role];
      navigate(location.state?.from?.pathname ?? fallback, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#eef1f6] p-4 [perspective:1800px]">
      {/* ambient depth blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#0E5EF9]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-[#5F9AF8]/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-10 h-40 w-40 rounded-full bg-white/60 blur-2xl" />

      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-[32px] bg-white [transform:rotateX(2deg)_rotateY(-3deg)] transition-transform duration-500 hover:[transform:rotateX(0deg)_rotateY(0deg)] md:h-[520px] md:flex-row"
        style={{
          boxShadow:
            "0 2px 0 rgba(255,255,255,0.9) inset, 0 45px 80px -25px rgba(14,94,249,0.45), 0 15px 30px -10px rgba(20,30,60,0.25)",
        }}
      >
        {/* Brand / left panel */}
        <div
          className="relative flex shrink-0 flex-col justify-center overflow-hidden bg-gradient-to-br from-[#3f7dfb] via-[#0E5EF9] to-[#0a3fb3] px-7 py-7 text-white md:w-[46%] md:justify-between md:px-10 md:py-10 md:pb-10 md:pt-10 md:rounded-r-[160px]"
          style={{ boxShadow: "inset -12px -12px 30px rgba(0,0,0,0.18), inset 8px 8px 20px rgba(255,255,255,0.25)" }}
        >
          {/* glossy highlight */}
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />

          <div>
            <div className="flex flex-col items-center gap-2 md:items-start md:gap-3">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-white/40 to-white/5 md:h-16 md:w-16"
                style={{ boxShadow: "0 10px 20px rgba(0,0,0,0.25), inset 0 2px 4px rgba(255,255,255,0.6)" }}
              >
                <GraduationCap className="h-7 w-7 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] md:h-8 md:w-8" />
              </span>
              <span className="text-center md:text-left">
                <span className="block text-[15px] font-bold leading-tight tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] md:text-[17px]">
                  SchoolSphere
                </span>
                <span className="block text-[10px] font-medium tracking-wide text-white/75 md:text-[11px]">
                  Smart School Management
                </span>
              </span>
            </div>

            <h1 className="mt-4 text-center text-[23px] font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)] md:mt-8 md:text-left md:text-[26px]">
              Welcome Back!
            </h1>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-white/85 md:mt-2 md:text-left">
              To stay connected with us
              <br className="hidden md:block" /> please login with your personal info
            </p>
          </div>

          <div className="hidden flex-col gap-6 md:flex">
            <span
              className="w-fit rounded-full border border-white/50 bg-white/10 px-8 py-2.5 text-[12px] font-semibold tracking-wide backdrop-blur-sm"
              style={{ boxShadow: "0 6px 14px rgba(0,0,0,0.2)" }}
            >
              SIGN IN
            </span>
            <p className="text-[10px] text-white/60">
              CREATOR <span className="font-semibold text-white">HERE</span> &nbsp;|&nbsp; DIRECTOR{" "}
              <span className="font-semibold text-white">HERE</span>
            </p>
          </div>
        </div>

        {/* Form / right panel */}
        <div className="flex flex-1 flex-col justify-center px-6 py-5 md:px-14 md:py-8">
          <h2 className="text-center text-[20px] font-extrabold text-[#0E5EF9] md:text-left md:text-[26px]">welcome</h2>
          <p className="mt-1 text-center text-[12px] text-gray-400 md:text-left md:text-[13px]">
            Login in to your account to continue
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3 md:mt-7 md:space-y-4">
            <div className="relative">
              <img
                src="https://cdn-icons-png.flaticon.com/512/8921/8921936.png"
                alt=""
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70"
              />
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="User id"
                className="w-full rounded-full border-0 bg-[#eef2f9] py-2.5 pl-11 pr-5 text-[13px] text-[#1c1c28] placeholder:text-[#7fa8dd] focus:outline-none focus:ring-2 focus:ring-[#0E5EF9]/40 md:py-3"
                style={{ boxShadow: "inset 4px 4px 8px rgba(163,177,198,0.45), inset -4px -4px 8px rgba(255,255,255,0.9)" }}
              />
            </div>

            <div className="relative">
              <img
                src="https://cdn-icons-png.flaticon.com/512/10464/10464776.png"
                alt=""
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70"
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-full border-0 bg-[#eef2f9] py-2.5 pl-11 pr-11 text-[13px] text-[#1c1c28] placeholder:text-[#7fa8dd] focus:outline-none focus:ring-2 focus:ring-[#0E5EF9]/40 md:py-3"
                style={{ boxShadow: "inset 4px 4px 8px rgba(163,177,198,0.45), inset -4px -4px 8px rgba(255,255,255,0.9)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7fa8dd] hover:text-[#0E5EF9]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && <p className="text-center text-[11px] font-medium text-destructive md:text-left">{error}</p>}

            <p className="text-center text-[12px] text-gray-500 md:text-left">
              <a href="#" className="hover:text-[#0E5EF9]">
                Forgot your password?
              </a>
            </p>

            <div className="flex justify-center md:justify-start">
              <button
                type="submit"
                disabled={submitting}
                className="flex w-40 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#3f7dfb] to-[#0E5EF9] py-2 text-[13px] font-semibold tracking-wide text-white transition-all duration-150 hover:brightness-105 active:translate-y-[2px] disabled:opacity-60 md:py-2.5"
                style={{ boxShadow: "0 10px 20px rgba(14,94,249,0.4), inset 0 2px 3px rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.15)" }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "LOG IN"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
