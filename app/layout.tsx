import "./globals.css";
export const metadata = { title: "Orbit Dates - agents that date for you", description: "Every person gets an agent. The agents date each other. You get the ranking." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
