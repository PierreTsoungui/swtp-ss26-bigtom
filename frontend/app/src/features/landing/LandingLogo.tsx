import logo from "../../assets/logo.svg";

export function LandingLogo() {
  return (
    <div className="flex w-full max-w-xl items-center justify-center">
      <img
        src={logo}
        alt="BigTom DNA methylation analysis platform logo"
        className="h-auto w-full object-contain"
      />
    </div>
  );
}
