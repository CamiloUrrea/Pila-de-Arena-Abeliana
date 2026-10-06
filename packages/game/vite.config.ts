import { defineConfig } from 'vite';

// Servidor de desarrollo y compilación del cliente. La raíz es este paquete (index.html); la salida va a dist/.
export default defineConfig({
  // Base relativa: la compilación funciona desde cualquier carpeta o servidor (por ejemplo itch.io o una subruta).
  base: './',
  build: {
    target: 'es2024',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
