import { Globe, Moon, Sun, BookOpen, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import hexagonLogo from '../../assets/app-logo/hexagon.png';

interface AuthHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export function AuthHeader({ isDark, toggleTheme }: AuthHeaderProps) {
  return (
    <header className="w-full px-6 py-4 flex items-center justify-between bg-transparent">
      <div className="flex items-center gap-1 text-zinc-900 dark:text-white">
        <img src={hexagonLogo} alt="Beacyn" className="w-10 h-10" />
        <span className="font-bold text-2xl tracking-tight">Beacyn <span className="text-rose-400 dark:text-rose-500">.</span></span>
        <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500 mt-1.5">Enterprise Monitoring & Observability</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <a href="#" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline-offset-4 transition-colors">
          <BookOpen className="w-4 h-4" />
          <span>Docs</span>
        </a>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">EN</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>English</DropdownMenuItem>
            <DropdownMenuItem>Spanish</DropdownMenuItem>
            <DropdownMenuItem>French</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={toggleTheme}
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
