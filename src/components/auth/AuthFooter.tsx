import { Button } from '../ui/button';

export function AuthFooter() {
  return (
    <footer className="w-full px-6 py-8 bg-transparent mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center md:text-left">
          &copy; 2026 Mackdev. All rights reserved.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
          <Button variant="link" asChild className="h-auto p-0 text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            <a href="#">Privacy policy</a>
          </Button>
          <Button variant="link" asChild className="h-auto p-0 text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            <a href="#">Terms of Use</a>
          </Button>
          <Button variant="link" asChild className="h-auto p-0 text-sm font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
            <a href="#">Disclaimer</a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
