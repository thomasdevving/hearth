import logo from "../assets/hearth-logo.png";

/** The Hearth mark: the magenta pinwheel. Decorative next to the word "Hearth". */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src={logo} width={size} height={size} alt="" aria-hidden="true" style={{ display: "block" }} />;
}

export function Wordmark({ href = "#/" }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="Hearth home">
      <LogoMark />
      Hearth
    </a>
  );
}
