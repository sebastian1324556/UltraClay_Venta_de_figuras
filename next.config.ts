import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El cliente de Turso (libSQL) usa binarios nativos en Node: se cargan desde node_modules.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
