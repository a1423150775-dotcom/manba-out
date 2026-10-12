using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace ElbowMayhemLauncher
{
    internal sealed class TunnelInfo
    {
        public int Id;
        public string Name;
        public string Type;
        public int NodeId;
        public string NodeHost;
        public string LocalIp;
        public int LocalPort;
        public string Remote;
        public bool Online;
        public string PublicAddress;
        public override string ToString() { return Name + " (#" + Id + ")"; }
    }

    internal static class SakuraBridge
    {
        private const string ApiRoot = "https://api.natfrp.com/v4";
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        public static string InstallDirectory
        {
            get
            {
                string[] candidates = {
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SakuraFrpLauncher"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "SakuraFrpLauncher")
                };
                foreach (string path in candidates)
                    if (File.Exists(Path.Combine(path, "frpc.exe")) && File.Exists(Path.Combine(path, "SakuraLauncher.exe"))) return path;
                return null;
            }
        }

        public static string ServiceConfigPath
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SakuraFrpService", "config.json"); }
        }

        // 本机 SakuraFrp Launcher 随附 frpc 明确禁止由 Service 以外的程序启动。
        // 官方文档没有提供外部启动单条 Service 隧道的公开接口。
        public static bool SupportsExternalTunnelControl { get { return false; } }

        public static string ClientState()
        {
            if (InstallDirectory == null) return "未检测到 SakuraFrp 安装";
            try
            {
                if (Process.GetProcessesByName("SakuraFrpService").Length > 0) return "服务运行中";
                if (Process.GetProcessesByName("SakuraLauncher").Length > 0) return "客户端窗口运行中";
                if (Process.GetProcessesByName("frpc").Length > 0) return "frpc 运行中";
            }
            catch { return "已安装，进程状态未知"; }
            return "已安装，当前未运行";
        }

        private static string ReadToken()
        {
            if (!File.Exists(ServiceConfigPath)) throw new InvalidOperationException("未找到 SakuraFrp 已有配置；请先在原客户端登录。\n本启动器不会新建账户或隧道。");
            Dictionary<string, object> config = Serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(ServiceConfigPath, Encoding.UTF8));
            object token;
            if (config == null || !config.TryGetValue("token", out token) || String.IsNullOrWhiteSpace(Convert.ToString(token)))
                throw new InvalidOperationException("SakuraFrp 已有配置中没有访问密钥；请在原客户端登录。");
            return Convert.ToString(token);
        }

        private static object ReadOfficialApi(string path, string token)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(ApiRoot + path);
            request.Timeout = 12000; request.ReadWriteTimeout = 12000;
            request.Headers[HttpRequestHeader.Authorization] = "Bearer " + token;
            request.UserAgent = "ElbowMayhemLauncher/1.0";
            using (WebResponse response = request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                return Serializer.DeserializeObject(reader.ReadToEnd());
        }

        private static string Field(Dictionary<string, object> value, string key)
        {
            object found;
            return value.TryGetValue(key, out found) && found != null ? Convert.ToString(found) : "";
        }

        private static int Number(Dictionary<string, object> value, string key)
        {
            int result; return int.TryParse(Field(value, key), out result) ? result : 0;
        }

        public static List<TunnelInfo> ReadTunnels()
        {
            string token = ReadToken();
            object tunnelResponse = ReadOfficialApi("/tunnels", token);
            object nodeResponse = ReadOfficialApi("/nodes", token);
            object[] rows = tunnelResponse as object[];
            Dictionary<string, object> nodes = nodeResponse as Dictionary<string, object>;
            if (rows == null || nodes == null) throw new InvalidOperationException("SakuraFrp 官方 API 返回了未知的数据格式。");
            List<TunnelInfo> tunnels = new List<TunnelInfo>();
            foreach (object row in rows)
            {
                Dictionary<string, object> value = row as Dictionary<string, object>;
                if (value == null) continue;
                TunnelInfo tunnel = new TunnelInfo();
                tunnel.Id = Number(value, "id"); tunnel.Name = Field(value, "name"); tunnel.Type = Field(value, "type").ToLowerInvariant();
                tunnel.NodeId = Number(value, "node"); tunnel.LocalIp = Field(value, "local_ip"); tunnel.LocalPort = Number(value, "local_port");
                tunnel.Remote = Field(value, "remote");
                object online;
                tunnel.Online = value.TryGetValue("online", out online) && online is bool && (bool)online;
                object node;
                Dictionary<string, object> nodeValue = nodes.TryGetValue(tunnel.NodeId.ToString(), out node) ? node as Dictionary<string, object> : null;
                tunnel.NodeHost = nodeValue == null ? "" : Field(nodeValue, "host");
                if (tunnel.Type == "tcp")
                {
                    int remotePort;
                    if (!String.IsNullOrWhiteSpace(tunnel.NodeHost) && int.TryParse(tunnel.Remote, out remotePort) && remotePort > 0 && remotePort <= 65535)
                        tunnel.PublicAddress = "http://" + tunnel.NodeHost + ":" + remotePort;
                }
                else if ((tunnel.Type == "http" || tunnel.Type == "https") && !String.IsNullOrWhiteSpace(tunnel.Remote))
                {
                    string domain = tunnel.Remote.Split(',')[0].Trim();
                    if (Uri.CheckHostName(domain) != UriHostNameType.Unknown) tunnel.PublicAddress = tunnel.Type + "://" + domain;
                }
                tunnels.Add(tunnel);
            }
            return tunnels;
        }

        public static Process StartOwnedTunnel(TunnelInfo tunnel, Action<string> report)
        {
            string directory = InstallDirectory;
            if (directory == null) throw new InvalidOperationException("未找到已安装的 SakuraFrp frpc.exe。");
            if (tunnel == null || tunnel.Id <= 0) throw new InvalidOperationException("未选择有效隧道。");
            if (tunnel.Online) throw new InvalidOperationException("所选隧道已在线，不会重复启动。");
            string token = ReadToken();
            ProcessStartInfo info = new ProcessStartInfo(Path.Combine(directory, "frpc.exe"));
            info.WorkingDirectory = directory; info.UseShellExecute = false; info.CreateNoWindow = true;
            info.RedirectStandardOutput = true; info.RedirectStandardError = true;
            // SakuraFrp 官方 frpc 手册支持这两个环境变量；密钥不会出现在命令行、日志或便携包中。
            info.EnvironmentVariables["NATFRP_TOKEN"] = token;
            info.EnvironmentVariables["NATFRP_TARGET"] = tunnel.Id.ToString();
            Process process = new Process(); process.StartInfo = info; process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (args.Data != null) report(SafeClientLine(args.Data, token));
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (args.Data != null) report(SafeClientLine(args.Data, token));
            };
            if (!process.Start()) throw new InvalidOperationException("已安装的 frpc.exe 未能启动。");
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            return process;
        }

        private static string SafeClientLine(string line, string token)
        {
            string scrubbed = line.Replace(token, "[隐藏密钥]");
            if (scrubbed.Length > 300) scrubbed = scrubbed.Substring(0, 300) + "…";
            return scrubbed;
        }

        public static bool CheckPublicGame(string address)
        {
            Uri parsed;
            if (!Uri.TryCreate(address, UriKind.Absolute, out parsed) || (parsed.Scheme != "http" && parsed.Scheme != "https")) return false;
            try
            {
                string root = address.TrimEnd('/');
                return Get(root + "/health").Contains("\"ok\":true") &&
                    Get(root + "/").Contains("肘击大乱斗") &&
                    Get(root + "/socket.io/?EIO=4&transport=polling").StartsWith("0{");
            }
            catch { return false; }
        }

        private static string Get(string address)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(address);
            request.Timeout = 3000; request.ReadWriteTimeout = 3000;
            using (WebResponse response = request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) return reader.ReadToEnd();
        }
    }
}
