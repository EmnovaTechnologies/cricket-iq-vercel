// src/app/admin/icon-library/page.tsx
'use client';

import {
  Activity, AlertCircle, AlertTriangle, Aperture, Archive, ArchiveRestore, ArrowLeft, ArrowRight, Award, BarChart3,
  Bell, Binary, Bone, Bookmark, Building, Bug, Cake, Calendar, CalendarClock, CalendarDays,
  CalendarFold, CalendarIcon, CalendarX, Camera, Check, CheckCircle, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsUpDown, Circle, CircleUser, Clipboard, ClipboardCheck, Clock, Cloud, Code2, Coins, Copy, CreditCard,
  Crosshair, Database, Download, Dumbbell, Edit, Edit3, ExternalLink, Eye, File, FileText, Film, Filter, Flag, Folder,
  Gamepad2, GitBranch, Github, Globe, Grid, Heart, Home, Hourglass, Image as ImageIcon, Info, Key, Keyboard,
  Laptop, Layers, Leaf, LifeBuoy, Link, Link2, ListChecks, ListFilter, ListOrdered, Loader2, Lock, LogIn, LogOut,
  Mail, Map as MapIconLucide, MapPin, MapPinned, Menu, MessageSquare, Mic, Moon, MousePointer, Move, Music,
  Palette, Package, PanelLeft, Paperclip, PenTool, Phone, PlusCircle, Power, Printer, Quote, Rocket, Rss, Save, Search,
  Send, Settings, Share2, Shield, ShieldAlert, ShieldCheck, ShieldPlus, ShoppingBag, Siren, Slack, SlidersHorizontal,
  Smartphone, Speaker, Square, Star, Sun, Tag, Target, Terminal, ThumbsUp, ToggleRight, Trash2, TrendingUp,
  Trophy, Twitch, Twitter, Type, Upload, UploadCloud, User, UserCheck, UserCog, UserPlus, UserSquare2, Users, Users2,
  UserX, Video, Voicemail, Wallet, Watch, Wifi, Wind, X, XCircle, Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  CricketBatIcon,
  CricketBatAndBallIcon,
  CricketBallIcon,
  StumpsAndBallIcon,
  GoogleIcon,
  WicketKeeperGloves,
  } from '@/components/custom-icons';


const projectIcons = {
  'Lucide Icons (In Use)': [
    { name: 'Activity', Icon: Activity }, { name: 'AlertCircle', Icon: AlertCircle }, { name: 'AlertTriangle', Icon: AlertTriangle },
    { name: 'Archive', Icon: Archive }, { name: 'ArchiveRestore', Icon: ArchiveRestore }, { name: 'ArrowLeft', Icon: ArrowLeft },
    { name: 'ArrowRight', Icon: ArrowRight }, { name: 'BarChart3', Icon: BarChart3 }, { name: 'Binary', Icon: Binary },
    { name: 'Building', Icon: Building }, { name: 'Cake', Icon: Cake }, { name: 'CalendarClock', Icon: CalendarClock },
    { name: 'CalendarDays', Icon: CalendarDays }, { name: 'CalendarFold', Icon: CalendarFold }, { name: 'CalendarIcon', Icon: CalendarIcon },
    { name: 'CalendarX', Icon: CalendarX }, { name: 'Check', Icon: Check }, { name: 'CheckCircle', Icon: CheckCircle },
    { name: 'CheckSquare', Icon: CheckSquare }, { name: 'ChevronLeft', Icon: ChevronLeft }, { name: 'ChevronRight', Icon: ChevronRight },
    { name: 'ChevronsUpDown', Icon: ChevronsUpDown }, { name: 'Circle', Icon: Circle }, { name: 'ClipboardCheck', Icon: ClipboardCheck },
    { name: 'Clock', Icon: Clock }, { name: 'Copy', Icon: Copy }, { name: 'CreditCard', Icon: CreditCard },
    { name: 'Crosshair', Icon: Crosshair }, { name: 'Download', Icon: Download }, { name: 'Dumbbell', Icon: Dumbbell },
    { name: 'Edit', Icon: Edit }, { name: 'Edit3', Icon: Edit3 }, { name: 'ExternalLink', Icon: ExternalLink },
    { name: 'FileText', Icon: FileText }, { name: 'Filter', Icon: Filter }, { name: 'Gamepad2', Icon: Gamepad2 },
    { name: 'Globe', Icon: Globe }, { name: 'Hourglass', Icon: Hourglass }, { name: 'ImageIcon', Icon: ImageIcon },
    { name: 'Info', Icon: Info }, { name: 'Key', Icon: Key }, { name: 'Layers', Icon: Layers },
    { name: 'Leaf', Icon: Leaf }, { name: 'Link2', Icon: Link2 }, { name: 'ListChecks', Icon: ListChecks },
    { name: 'ListFilter', Icon: ListFilter }, { name: 'ListOrdered', Icon: ListOrdered }, { name: 'Loader2', Icon: Loader2 },
    { name: 'LogIn', Icon: LogIn }, { name: 'LogOut', Icon: LogOut }, { name: 'Mail', Icon: Mail },
    { name: 'MapIconLucide', Icon: MapIconLucide }, { name: 'MapPin', Icon: MapPin }, { name: 'MapPinned', Icon: MapPinned },
    { name: 'Menu', Icon: Menu }, { name: 'Palette', Icon: Palette }, { name: 'PanelLeft', Icon: PanelLeft },
    { name: 'Phone', Icon: Phone }, { name: 'PlusCircle', Icon: PlusCircle }, { name: 'Save', Icon: Save },
    { name: 'Search', Icon: Search }, { name: 'Shield', Icon: Shield }, { name: 'ShieldAlert', Icon: ShieldAlert },
    { name: 'ShieldCheck', Icon: ShieldCheck }, { name: 'ShieldPlus', Icon: ShieldPlus }, { name: 'Square', Icon: Square },
    { name: 'Star', Icon: Star }, { name: 'Tag', Icon: Tag }, { name: 'Target', Icon: Target },
    { name: 'Terminal', Icon: Terminal }, { name: 'Trash2', Icon: Trash2 }, { name: 'Trophy', Icon: Trophy },
    { name: 'Upload', Icon: Upload }, { name: 'UploadCloud', Icon: UploadCloud }, { name: 'User', Icon: User },
    { name: 'UserCheck', Icon: UserCheck }, { name: 'UserCog', Icon: UserCog }, { name: 'UserPlus', Icon: UserPlus },
    { name: 'UserSquare2', Icon: UserSquare2 }, { name: 'Users', Icon: Users }, { name: 'Users2', Icon: Users2 },
    { name: 'UserX', Icon: UserX }, { name: 'X', Icon: X }, { name: 'XCircle', Icon: XCircle }
  ].sort((a, b) => a.name.localeCompare(b.name)),
  'Custom SVG Icons (In Use)': [
    { name: 'CricketBatAndBallIcon', Icon: CricketBatAndBallIcon },
    { name: 'CricketBallIcon', Icon: CricketBallIcon },
    { name: 'StumpsAndBallIcon', Icon: StumpsAndBallIcon },
    { name: 'GoogleIcon', Icon: GoogleIcon },
    { name: 'CricketBatIcon', Icon: CricketBatIcon },
    { name: 'WicketKeeperGloves', Icon: WicketKeeperGloves },
  ].sort((a, b) => a.name.localeCompare(b.name)),
};

const availableIcons = {
  'Available Lucide Icons': [
    { name: 'Aperture', Icon: Aperture }, { name: 'Award', Icon: Award }, { name: 'Bell', Icon: Bell },
    { name: 'Bone', Icon: Bone }, { name: 'Bookmark', Icon: Bookmark }, { name: 'Bug', Icon: Bug },
    { name: 'Calendar', Icon: Calendar }, { name: 'Camera', Icon: Camera }, { name: 'ChevronDown', Icon: ChevronDown },
    { name: 'CircleUser', Icon: CircleUser }, { name: 'Clipboard', Icon: Clipboard }, { name: 'Cloud', Icon: Cloud },
    { name: 'Code2', Icon: Code2 }, { name: 'Coins', Icon: Coins }, { name: 'Database', Icon: Database },
    { name: 'Eye', Icon: Eye }, { name: 'File', Icon: File }, { name: 'Film', Icon: Film },
    { name: 'Flag', Icon: Flag }, { name: 'Folder', Icon: Folder }, { name: 'GitBranch', Icon: GitBranch },
    { name: 'Github', Icon: Github }, { name: 'Grid', Icon: Grid }, { name: 'Heart', Icon: Heart },
    { name: 'Home', Icon: Home }, { name: 'Keyboard', Icon: Keyboard }, { name: 'Laptop', Icon: Laptop },
    { name: 'LifeBuoy', Icon: LifeBuoy }, { name: 'Link', Icon: Link }, { name: 'Lock', Icon: Lock },
    { name: 'MessageSquare', Icon: MessageSquare }, { name: 'Mic', Icon: Mic }, { name: 'Moon', Icon: Moon },
    { name: 'MousePointer', Icon: MousePointer }, { name: 'Move', Icon: Move }, { name: 'Music', Icon: Music },
    { name: 'Package', Icon: Package }, { name: 'Paperclip', Icon: Paperclip }, { name: 'PenTool', Icon: PenTool },
    { name: 'Power', Icon: Power }, { name: 'Printer', Icon: Printer }, { name: 'Quote', Icon: Quote },
    { name: 'Rocket', Icon: Rocket }, { name: 'Rss', Icon: Rss }, { name: 'Send', Icon: Send },
    { name: 'Settings', Icon: Settings }, { name: 'Share2', Icon: Share2 }, { name: 'ShoppingBag', Icon: ShoppingBag },
    { name: 'Siren', Icon: Siren }, { name: 'Slack', Icon: Slack }, { name: 'SlidersHorizontal', Icon: SlidersHorizontal },
    { name: 'Smartphone', Icon: Smartphone }, { name: 'Speaker', Icon: Speaker }, { name: 'Sun', Icon: Sun },
    { name: 'ThumbsUp', Icon: ThumbsUp }, { name: 'ToggleRight', Icon: ToggleRight }, { name: 'TrendingUp', Icon: TrendingUp },
    { name: 'Twitch', Icon: Twitch }, { name: 'Twitter', Icon: Twitter }, { name: 'Type', Icon: Type },
    { name: 'Video', Icon: Video }, { name: 'Voicemail', Icon: Voicemail }, { name: 'Wallet', Icon: Wallet },
    { name: 'Watch', Icon: Watch }, { name: 'Wifi', Icon: Wifi }, { name: 'Wind', Icon: Wind }, { name: 'Zap', Icon: Zap }
  ].sort((a, b) => a.name.localeCompare(b.name)),
};


const IconDisplayCard: React.FC<{
  name: string;
  Icon: React.ElementType;
  isCustom?: boolean;
  onRemove?: (name: string) => void;
}> = ({ name, Icon, isCustom, onRemove }) => (
  <div className="relative flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm group">
    <Icon className="h-8 w-8 text-primary" />
    <code className="text-xs text-muted-foreground">{name}</code>
    {isCustom && onRemove && (
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(name)}
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </div>
);

export default function IconLibraryPage() {
  const { toast } = useToast();

  const handleRemoveIcon = (iconName: string) => {
    toast({
      title: "Remove Icon Action",
      description: `In a real app, this would trigger an action to remove the '${iconName}' SVG component from the codebase.`,
    });
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ICON_LIBRARY}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
            <CardContent><p>You do not have permission to view the icon library.</p></CardContent>
          </Card>
        </div>
      }
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Icon Library</CardTitle>
            <CardDescription>A visual reference of all icons used in this project, and a library of available icons for new features.</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Icons</CardTitle>
            <CardDescription>This is a curated set of icons currently in use in the application, including all custom SVGs.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.entries(projectIcons).map(([category, icons]) => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-lg font-semibold text-foreground mb-3">{category}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {icons.map(({ name, Icon }) => (
                    <IconDisplayCard
                      key={name}
                      name={name}
                      Icon={Icon}
                      isCustom={category.includes('Custom')}
                      onRemove={handleRemoveIcon}
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

         <Card>
          <CardHeader>
            <CardTitle>Available Lucide Icons</CardTitle>
            <CardDescription>A larger library of pre-installed icons available for use in new components and features.</CardDescription>
          </CardHeader>
          <CardContent>
             {Object.entries(availableIcons).map(([category, icons]) => (
                <div key={category}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                        {icons.map(({ name, Icon }) => (
                            <IconDisplayCard key={name} name={name} Icon={Icon} />
                        ))}
                    </div>
                </div>
            ))}
          </CardContent>
        </Card>
    </div>
  </AuthProviderClientComponent>
  );
}
