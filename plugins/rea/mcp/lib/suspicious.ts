/**
 * 导入 API 的可疑面标注。
 *
 * 只是「能力清单」：命中的 API 说明程序**可能**具备这类行为，不构成恶意判定。
 * 表按功能归类，名字统一小写并去掉 Mach-O 的前导下划线后再匹配。
 */

export type SuspiciousHit = { name: string; library: string; category: string };

const CATEGORIES: Array<[string, string[]]> = [
  [
    "进程注入/内存操作",
    [
      "virtualallocex",
      "writeprocessmemory",
      "createremotethread",
      "ntcreatethreadex",
      "rtlcreateuserthread",
      "queueuserapc",
      "setthreadcontext",
      "getthreadcontext",
      "openprocess",
      "virtualprotect",
      "virtualprotectex",
      "mapviewoffile",
      "ntmapviewofsection",
      "ntunmapviewofsection",
      "suspendthread",
      "resumethread",
      "createtoolhelp32snapshot",
      "process32first",
      "process32next",
      "module32first",
      "thread32first",
      "enumprocesses",
      "wow64",
      "ntsuspendprocess",
      "ntresumeprocess",
    ],
  ],
  [
    "反调试/反分析",
    [
      "isdebuggerpresent",
      "checkremotedebuggerpresent",
      "ntqueryinformationprocess",
      "outputdebugstringa",
      "outputdebugstringw",
      "ptrace",
      "sysctl",
      "sysctlbyname",
      "task_for_pid",
      "mach_vm_read",
      "mach_vm_read_overwrite",
      "vm_read",
      "gettickcount",
      "queryperformancecounter",
      "gettickcount64",
      "ntquerysysteminformation",
      "findwindowa",
      "findwindoww",
      "enumwindows",
    ],
  ],
  [
    "执行/启动",
    [
      "winexec",
      "shellexecutea",
      "shellexecutew",
      "shellexecuteexa",
      "shellexecuteexw",
      "createprocessa",
      "createprocessw",
      "createprocessasuser",
      "system",
      "posix_spawn",
      "posix_spawnp",
      "execve",
      "execv",
      "execvp",
      "execl",
      "execlp",
      "fork",
      "vfork",
      "popen",
      "_popen",
      "startprocess",
    ],
  ],
  [
    "动态加载",
    [
      "loadlibrarya",
      "loadlibraryw",
      "loadlibraryexa",
      "loadlibraryexw",
      "getprocaddress",
      "freelibrary",
      "dlopen",
      "dlsym",
      "dlclose",
      "ldcall",
    ],
  ],
  [
    "网络",
    [
      "internetopen",
      "internetopenurla",
      "internetopenurlw",
      "internetsetoption",
      "internetconnect",
      "httpopenrequest",
      "httpsendrequest",
      "internetreadfile",
      "winhttpopen",
      "winhttpconnect",
      "winhttpopenrequest",
      "winhttpsendrequest",
      "winhttpreceiveresponse",
      "urldownloadtofile",
      "urlcaches",
      "socket",
      "connect",
      "bind",
      "listen",
      "accept",
      "send",
      "recv",
      "sendto",
      "recvfrom",
      "getaddrinfo",
      "gethostbyname",
      "inet_addr",
      "wsastartup",
      "wsasocket",
      "dnsquery",
      "getifaddrs",
      "curl_easy_perform",
    ],
  ],
  [
    "持久化/系统修改",
    [
      "regsetvalueexa",
      "regsetvalueexw",
      "regcreatekeyexa",
      "regcreatekeyexw",
      "regopenkeyexa",
      "createservicea",
      "createservicew",
      "openscmanager",
      "startservicea",
      "startservicew",
      "setwindowshookexa",
      "setwindowshookexw",
      "launchctl",
      "smjobsubmit",
      "install",
      "schtasks",
    ],
  ],
  [
    "加密/编码",
    [
      "cryptencrypt",
      "cryptdecrypt",
      "cryptacquirecontexta",
      "cryptacquirecontextw",
      "bcryptencrypt",
      "bcryptdecrypt",
      "bcryptgeneratesymmetrickey",
      "cchpf",
      "evp_encryptinit_ex",
      "evp_decryptinit_ex",
      "aes_set_encrypt_key",
      "rc4",
      "md5_init",
      "sha1_init",
      "sha256_init",
      "compress",
      "uncompress",
      "base64",
    ],
  ],
  [
    "信息收集",
    [
      "getcomputernamea",
      "getcomputernamew",
      "getusernamea",
      "getusernamew",
      "getsysteminfo",
      "getvolumeinformationa",
      "getadaptersinfo",
      "gethostname",
      "uname",
      "ioctl",
      "nsprocessinfo",
      "hostname",
    ],
  ],
  [
    "键盘/屏幕",
    [
      "getasynckeystate",
      "getkeystate",
      "getdc",
      "getwindowdc",
      "bitblt",
      "createcompatibledc",
      "getsystemmetrics",
      "openinputdesktop",
      "getforegroundwindow",
      "cgdisplaycreateimage",
      "cgeventtapcreate",
    ],
  ],
  [
    "凭证/密钥",
    [
      "credreada",
      "credreadw",
      "credenumeratea",
      "credenumeratew",
      "lsasetsecret",
      "lsaenumeratelogonSessions",
      "securityfindgenericpassword",
      "securityfindinternetpassword",
      "secitemcopyMatching",
      "seckeychainitemcopyContent",
    ],
  ],
  ["沙箱/虚拟机探测", ["vmware", "virtualbox", "vbox", "wine_get_unix_file_name", "hypervisor", "hv_vm"]],
  ["剪贴板", ["getclipboarddata", "setclipboarddata", "openclipboard"]],
];

const LOOKUP = new Map<string, string>();
for (const [category, names] of CATEGORIES) {
  for (const n of names) LOOKUP.set(n.toLowerCase(), category);
}

export function normalizeApiName(name: string): string {
  return name.replace(/^_+/, "").toLowerCase();
}

/** 从导入表里挑出命中能力表的条目（去重，按分类排序） */
export function findSuspiciousApis(imports: Array<{ library: string; name: string }>): SuspiciousHit[] {
  const seen = new Set<string>();
  const hits: SuspiciousHit[] = [];
  for (const imp of imports) {
    const norm = normalizeApiName(imp.name);
    const category = LOOKUP.get(norm);
    if (!category) continue;
    const key = `${category}:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ name: imp.name, library: imp.library, category });
  }
  hits.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return hits;
}
