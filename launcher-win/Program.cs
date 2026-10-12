using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ElbowMayhemLauncher
{
    internal enum PortState { Available, Occupied, Unknown }

    internal sealed class PortResult
    {
        public PortState State;
        public string Detail;
        public PortResult(PortState state, string detail) { State = state; Detail = detail; }
    }

    internal static class PortScanner
    {
        public static PortResult Check(int port)
        {
            try
            {
                bool listened = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners()
                    .Any(endpoint => endpoint.Port == port);
                if (listened) return new PortResult(PortState.Occupied, Owner(port));
            }
            catch (Exception error) { return new PortResult(PortState.Unknown, "监听列表检测失败：" + error.Message); }

            PortResult ipv4 = TryBind(port, AddressFamily.InterNetwork);
            if (ipv4.State == PortState.Occupied) return new PortResult(PortState.Occupied, Owner(port));
            PortResult ipv6 = TryBind(port, AddressFamily.InterNetworkV6);
            if (ipv6.State == PortState.Occupied) return new PortResult(PortState.Occupied, Owner(port));
            if (ipv4.State == PortState.Unknown || ipv6.State == PortState.Unknown)
                return new PortResult(PortState.Unknown, ipv4.State == PortState.Unknown ? ipv4.Detail : ipv6.Detail);
            return new PortResult(PortState.Available, "IPv4 / IPv6 可绑定");
        }

        private static PortResult TryBind(int port, AddressFamily family)
        {
            try
            {
                using (Socket socket = new Socket(family, SocketType.Stream, ProtocolType.Tcp))
                {
                    socket.ExclusiveAddressUse = true;
                    if (family == AddressFamily.InterNetworkV6)
                        socket.SetSocketOption(SocketOptionLevel.IPv6, SocketOptionName.IPv6Only, true);
                    socket.Bind(new IPEndPoint(family == AddressFamily.InterNetwork ? IPAddress.Any : IPAddress.IPv6Any, port));
                    socket.Listen(1);
                }
                return new PortResult(PortState.Available, "可绑定");
            }
            catch (SocketException error)
            {
                if (error.SocketErrorCode == SocketError.AddressAlreadyInUse)
                    return new PortResult(PortState.Occupied, "端口已占用");
                return new PortResult(PortState.Unknown, family + " 检测失败：" + error.SocketErrorCode);
            }
            catch (Exception error) { return new PortResult(PortState.Unknown, family + " 检测失败：" + error.Message); }
        }

        private static string Owner(int port)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "netstat.exe"), "-ano -p tcp");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                using (Process process = Process.Start(info))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit(3000);
                    foreach (string line in output.Split('\n'))
                    {
                        string[] fields = line.Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                        if (fields.Length < 5 || !fields[0].Equals("TCP", StringComparison.OrdinalIgnoreCase) ||
                            !fields[3].Equals("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;
                        int separator = fields[1].LastIndexOf(':');
                        int foundPort, pid;
                        if (separator < 0 || !int.TryParse(fields[1].Substring(separator + 1), out foundPort) ||
                            foundPort != port || !int.TryParse(fields[4], out pid)) continue;
                        try { return "PID " + pid + " · " + Process.GetProcessById(pid).ProcessName; }
                        catch { return "PID " + pid; }
                    }
                }
            }
            catch { /* 进程详情不是判断端口的前提 */ }
            return "端口已占用（进程未知）";
        }
    }

    internal sealed class LauncherForm : Form
    {
        private static readonly int[] CommonPorts = { 3000, 3001, 5173, 5174, 5175, 8080, 8081 };
        private readonly string root = AppDomain.CurrentDomain.BaseDirectory;
        private readonly string gameDirectory;
        private readonly string logFile;
        private readonly object processLock = new object();
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private readonly string preferenceFile;
        private Process serverProcess;
        private bool busy;
        private bool stopping;
        private bool closeAfterStop;
        private int activePort;
        private string activeBind = "0.0.0.0";
        private string localAddress;
        private string lanAddress;

        private Label statusLabel;
        private Label localLabel;
        private Label lanLabel;
        private NumericUpDown portInput;
        private ListView portList;
        private TextBox logBox;
        private Button startButton;
        private Button stopButton;
        private Button restartButton;
        private Button openButton;
        private Button copyLocalButton;
        private Button copyLanButton;
        private Label sakuraClientLabel;
        private Label tunnelDetailsLabel;
        private Label matchLabel;
        private Label tunnelStatusLabel;
        private Label publicAddressLabel;
        private ComboBox tunnelSelector;
        private TextBox manualAddressInput;
        private CheckBox autoStartTunnel;
        private CheckBox autoStopTunnel;
        private Button startTunnelButton;
        private Button stopTunnelButton;
        private Button copyPublicButton;
        private Button openPublicButton;
        private Button useTunnelPortButton;
        private Process ownedTunnel;
        private List<TunnelInfo> tunnels = new List<TunnelInfo>();
        private Dictionary<int, string> manualAddresses = new Dictionary<int, string>();
        private int preferredTunnelId;
        private bool tunnelBusy;
        private bool publicVerified;
        private int ownedTunnelId;
        private bool sakuraRefreshBusy;

        public LauncherForm()
        {
            gameDirectory = Path.Combine(root, "GameServer");
            logFile = Path.Combine(root, "logs", "launcher.log");
            preferenceFile = Path.Combine(root, "config", "launcher.json");
            LoadPreferences();
            Text = "肘击大乱斗 · 服务器启动器";
            Font = new Font("Microsoft YaHei UI", 9F);
            BackColor = Color.FromArgb(245, 247, 252);
            ForeColor = Color.FromArgb(37, 46, 67);
            Size = new Size(760, 770);
            MinimumSize = new Size(650, 680);
            StartPosition = FormStartPosition.CenterScreen;
            BuildControls();
            UpdateButtons();
            Log("启动器已打开，等待启动游戏服务器。");
            Shown += delegate { RefreshPorts(); RefreshTunnels(); };
            FormClosing += HandleClosing;
        }

        private static Label LabelText(string text, int x, int y, int width, int height, float size, bool bold)
        {
            Label label = new Label();
            label.Text = text; label.Left = x; label.Top = y; label.Width = width; label.Height = height;
            label.Font = new Font("Microsoft YaHei UI", size, bold ? FontStyle.Bold : FontStyle.Regular);
            label.TextAlign = ContentAlignment.MiddleLeft;
            return label;
        }

        private static Button ButtonText(string text, int x, int y, int width, EventHandler click)
        {
            Button button = new Button();
            button.Text = text; button.Left = x; button.Top = y; button.Width = width; button.Height = 36;
            button.FlatStyle = FlatStyle.Flat; button.BackColor = Color.White;
            button.Click += click;
            return button;
        }

        private void BuildControls()
        {
            TabControl tabs = new TabControl(); tabs.Dock = DockStyle.Fill;
            TabPage serverTab = new TabPage("游戏服务器");
            TabPage sakuraTab = new TabPage("SakuraFrp 公网联机");
            tabs.TabPages.Add(serverTab); tabs.TabPages.Add(sakuraTab);
            Controls.Add(tabs);
            Panel surface = new Panel();
            surface.Dock = DockStyle.Fill; surface.AutoScroll = true;
            surface.Padding = new Padding(22);
            serverTab.Controls.Add(surface);

            Label heading = LabelText("肘击大乱斗 · 服务器启动器", 26, 16, 660, 43, 17, true);
            heading.ForeColor = Color.FromArgb(44, 63, 110); surface.Controls.Add(heading);
            statusLabel = LabelText("服务器状态：● 未启动", 28, 66, 660, 34, 11, true);
            statusLabel.ForeColor = Color.FromArgb(104, 112, 129); surface.Controls.Add(statusLabel);
            surface.Controls.Add(LabelText("选择服务器端口", 28, 109, 400, 30, 11, true));

            portList = new ListView();
            portList.Left = 28; portList.Top = 145; portList.Width = 675; portList.Height = 231;
            portList.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            portList.View = View.Details; portList.FullRowSelect = true; portList.MultiSelect = false;
            portList.HideSelection = false; portList.GridLines = true;
            portList.Columns.Add("端口", 110);
            portList.Columns.Add("状态", 135);
            portList.Columns.Add("详情 / 占用进程", 412);
            portList.SelectedIndexChanged += delegate
            {
                if (portList.SelectedItems.Count == 0) return;
                int port;
                if (int.TryParse(portList.SelectedItems[0].Text, out port)) portInput.Value = port;
            };
            surface.Controls.Add(portList);
            surface.Controls.Add(LabelText("自定义端口：", 28, 386, 112, 33, 9, false));
            portInput = new NumericUpDown();
            portInput.Left = 141; portInput.Top = 390; portInput.Width = 124;
            portInput.Minimum = 1; portInput.Maximum = 65535; portInput.Value = 3000;
            portInput.ValueChanged += delegate { UpdateTunnelPanel(); };
            surface.Controls.Add(portInput);
            surface.Controls.Add(ButtonText("刷新端口", 285, 387, 115, delegate { RefreshPorts(); }));
            startButton = ButtonText("▶ 启动服务器", 28, 439, 165, delegate { BeginStart(); });
            startButton.BackColor = Color.FromArgb(206, 232, 219); surface.Controls.Add(startButton);
            stopButton = ButtonText("■ 停止服务器", 205, 439, 165, delegate { BeginStop(false); }); surface.Controls.Add(stopButton);
            restartButton = ButtonText("↻ 重启服务器", 382, 439, 165, delegate { BeginStop(true); }); surface.Controls.Add(restartButton);

            localLabel = LabelText("本机地址：尚未启动", 28, 492, 665, 28, 9, false); surface.Controls.Add(localLabel);
            lanLabel = LabelText("局域网地址：尚未启动", 28, 522, 665, 28, 9, false); surface.Controls.Add(lanLabel);
            openButton = ButtonText("打开游戏", 28, 557, 135, delegate { OpenGame(); }); surface.Controls.Add(openButton);
            copyLocalButton = ButtonText("复制本机地址", 175, 557, 160, delegate { CopyAddress(localAddress); }); surface.Controls.Add(copyLocalButton);
            copyLanButton = ButtonText("复制局域网地址", 347, 557, 175, delegate { CopyAddress(lanAddress); }); surface.Controls.Add(copyLanButton);

            surface.Controls.Add(LabelText("运行日志", 28, 607, 400, 27, 11, true));
            logBox = new TextBox();
            logBox.Left = 28; logBox.Top = 640; logBox.Width = 675; logBox.Height = 105;
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            logBox.Multiline = true; logBox.ScrollBars = ScrollBars.Vertical; logBox.ReadOnly = true;
            logBox.BackColor = Color.White;
            surface.Controls.Add(logBox);
            BuildSakuraControls(sakuraTab);
        }

        private void BuildSakuraControls(TabPage page)
        {
            Panel surface = new Panel(); surface.Dock = DockStyle.Fill; surface.AutoScroll = true;
            page.Controls.Add(surface);
            surface.Controls.Add(LabelText("SakuraFrp 公网联机", 26, 18, 650, 40, 16, true));
            sakuraClientLabel = LabelText("客户端状态：检测中", 28, 64, 660, 32, 10, true); surface.Controls.Add(sakuraClientLabel);
            surface.Controls.Add(ButtonText("刷新隧道", 28, 105, 130, delegate { RefreshTunnels(); }));
            surface.Controls.Add(ButtonText("打开 SakuraFrp 客户端", 170, 105, 210, delegate { OpenSakuraClient(); }));
            surface.Controls.Add(LabelText("选择现有隧道", 28, 151, 200, 29, 10, true));
            tunnelSelector = new ComboBox(); tunnelSelector.Left = 28; tunnelSelector.Top = 184; tunnelSelector.Width = 440;
            tunnelSelector.DropDownStyle = ComboBoxStyle.DropDownList;
            tunnelSelector.SelectedIndexChanged += delegate { OnTunnelSelected(); };
            surface.Controls.Add(tunnelSelector);
            tunnelDetailsLabel = LabelText("隧道类型 / 节点 / 本地目标：尚未读取", 28, 224, 670, 52, 9, false);
            surface.Controls.Add(tunnelDetailsLabel);
            matchLabel = LabelText("端口匹配：请选择现有隧道", 28, 280, 670, 45, 10, true);
            surface.Controls.Add(matchLabel);
            useTunnelPortButton = ButtonText("将游戏端口设为隧道目标", 28, 328, 240, delegate { UseTunnelPort(); });
            surface.Controls.Add(useTunnelPortButton);
            tunnelStatusLabel = LabelText("隧道状态：未检测", 28, 371, 670, 32, 10, true);
            surface.Controls.Add(tunnelStatusLabel);
            publicAddressLabel = LabelText("公网地址：尚未获取", 28, 405, 670, 36, 9, false);
            surface.Controls.Add(publicAddressLabel);
            surface.Controls.Add(LabelText("手动地址（仅在官方 API 无法给出地址时使用）：", 28, 450, 500, 27, 9, false));
            manualAddressInput = new TextBox(); manualAddressInput.Left = 28; manualAddressInput.Top = 482; manualAddressInput.Width = 440;
            surface.Controls.Add(manualAddressInput);
            surface.Controls.Add(ButtonText("保存地址", 480, 479, 120, delegate { SaveManualAddress(); }));
            startTunnelButton = ButtonText("启动所选隧道", 28, 531, 160, delegate { BeginTunnelStart(); }); surface.Controls.Add(startTunnelButton);
            stopTunnelButton = ButtonText("停止所选隧道", 200, 531, 160, delegate { BeginTunnelStop(); }); surface.Controls.Add(stopTunnelButton);
            copyPublicButton = ButtonText("复制公网地址", 372, 531, 150, delegate { CopyAddress(CurrentPublicAddress()); }); surface.Controls.Add(copyPublicButton);
            openPublicButton = ButtonText("打开公网游戏", 534, 531, 150, delegate { OpenPublicGame(); }); surface.Controls.Add(openPublicButton);
            autoStartTunnel = new CheckBox(); autoStartTunnel.Text = "游戏启动并通过健康检查后，自动启动所选隧道";
            autoStartTunnel.Left = 28; autoStartTunnel.Top = 585; autoStartTunnel.Width = 550;
            autoStartTunnel.Enabled = SakuraBridge.SupportsExternalTunnelControl;
            surface.Controls.Add(autoStartTunnel);
            autoStopTunnel = new CheckBox(); autoStopTunnel.Text = "停止游戏时，自动停止本启动器启动的隧道";
            autoStopTunnel.Left = 28; autoStopTunnel.Top = 614; autoStopTunnel.Width = 550; autoStopTunnel.Checked = SakuraBridge.SupportsExternalTunnelControl;
            autoStopTunnel.Enabled = SakuraBridge.SupportsExternalTunnelControl;
            surface.Controls.Add(autoStopTunnel);
            Label note = LabelText("此客户端的 frpc 仅允许 SakuraFrp Service 启动，外部启停不可用。\n请点“打开 SakuraFrp 客户端”启动现有隧道，再点“刷新隧道”。", 28, 648, 670, 56, 8, false);
            note.ForeColor = Color.FromArgb(90, 100, 120); surface.Controls.Add(note);
            UpdateTunnelPanel();
        }

        private TunnelInfo SelectedTunnel()
        {
            return tunnelSelector == null ? null : tunnelSelector.SelectedItem as TunnelInfo;
        }

        private string CurrentPublicAddress()
        {
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null) return null;
            if (!String.IsNullOrWhiteSpace(tunnel.PublicAddress)) return tunnel.PublicAddress;
            string manual;
            return manualAddresses.TryGetValue(tunnel.Id, out manual) ? manual : null;
        }

        private void UpdateTunnelPanel()
        {
            if (tunnelSelector == null || portInput == null) return;
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null)
            {
                tunnelDetailsLabel.Text = "隧道类型 / 节点 / 本地目标：尚未读取";
                matchLabel.Text = "端口匹配：请选择现有隧道";
                publicAddressLabel.Text = "公网地址：尚未获取";
                useTunnelPortButton.Enabled = false;
            }
            else
            {
                tunnelDetailsLabel.Text = "类型：" + tunnel.Type.ToUpperInvariant() + "  节点：" + (String.IsNullOrWhiteSpace(tunnel.NodeHost) ? "未知" : tunnel.NodeHost) +
                    "\n本地目标：" + tunnel.LocalIp + ":" + tunnel.LocalPort;
                int gamePort = IsRunning() ? activePort : (int)portInput.Value;
                bool matches = gamePort == tunnel.LocalPort && (tunnel.LocalIp == "127.0.0.1" || tunnel.LocalIp == "localhost" || tunnel.LocalIp == "0.0.0.0" || tunnel.LocalIp == DetectLan());
                bool accessReady = matches && IsRunning() && tunnel.Online && publicVerified;
                matchLabel.Text = matches ? "端口匹配：游戏 " + gamePort + " → 隧道 " + tunnel.LocalPort :
                    "端口不匹配，当前隧道无法正确转发游戏。游戏 " + gamePort + "，隧道目标 " + tunnel.LocalPort;
                matchLabel.ForeColor = matches ? Color.ForestGreen : Color.Firebrick;
                useTunnelPortButton.Enabled = !IsRunning() && !busy && tunnel.LocalPort >= 1 && tunnel.LocalPort <= 65535;
                string address = CurrentPublicAddress();
                publicAddressLabel.Text = address == null ? "公网地址：无法自动读取；可手动填写" : "公网地址：" + address +
                    (String.IsNullOrWhiteSpace(tunnel.PublicAddress) ?
                        (accessReady ? "（用户配置，网页与 Socket.IO 已验证）" : "（用户配置，尚未验证）") :
                        (accessReady ? "（网页与 Socket.IO 已验证）" : "（来自官方 API，尚未验证）"));
                string manual;
                manualAddressInput.Text = manualAddresses.TryGetValue(tunnel.Id, out manual) ? manual : "";
            }
            bool owned = ownedTunnel != null && !ownedTunnel.HasExited;
            bool matchingNow = tunnel != null && tunnel.LocalPort == (IsRunning() ? activePort : (int)portInput.Value);
            startTunnelButton.Enabled = SakuraBridge.SupportsExternalTunnelControl && !tunnelBusy && IsRunning() && matchingNow && tunnel != null && !tunnel.Online && !owned && SakuraBridge.InstallDirectory != null;
            stopTunnelButton.Enabled = SakuraBridge.SupportsExternalTunnelControl && !tunnelBusy && owned && tunnel != null && tunnel.Id == ownedTunnelId;
            startTunnelButton.Text = SakuraBridge.SupportsExternalTunnelControl ? "启动所选隧道" : "启动隧道（由原客户端操作）";
            stopTunnelButton.Text = SakuraBridge.SupportsExternalTunnelControl ? "停止所选隧道" : "停止隧道（由原客户端操作）";
            copyPublicButton.Enabled = CurrentPublicAddress() != null;
            openPublicButton.Enabled = CurrentPublicAddress() != null && publicVerified && tunnel != null && tunnel.Online && IsRunning() && activePort == tunnel.LocalPort;
            tunnelStatusLabel.Text = tunnel == null ? "隧道状态：未选择" : tunnel.Online ? "隧道状态：官方 API 显示在线" : "隧道状态：离线";
            tunnelStatusLabel.ForeColor = tunnel != null && tunnel.Online ? Color.ForestGreen : Color.Gray;
        }

        private void RefreshTunnels()
        {
            if (sakuraRefreshBusy) return;
            sakuraRefreshBusy = true;
            sakuraClientLabel.Text = "客户端状态：" + SakuraBridge.ClientState() + " · 正在读取隧道";
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    List<TunnelInfo> fetched = SakuraBridge.ReadTunnels();
                    OnUi(delegate
                    {
                        int previous = SelectedTunnel() == null ? preferredTunnelId : SelectedTunnel().Id;
                        tunnels = fetched;
                        tunnelSelector.Items.Clear();
                        foreach (TunnelInfo item in fetched) tunnelSelector.Items.Add(item);
                        int index = fetched.FindIndex(item => item.Id == previous);
                        if (index < 0 && fetched.Count > 0) index = 0;
                        if (index >= 0) tunnelSelector.SelectedIndex = index;
                        sakuraClientLabel.Text = "客户端状态：" + SakuraBridge.ClientState() + " · 已读取 " + fetched.Count + " 条现有隧道";
                        sakuraRefreshBusy = false;
                        UpdateTunnelPanel();
                        TunnelInfo selected = SelectedTunnel();
                        string address = CurrentPublicAddress();
                        if (selected != null && selected.Online && IsRunning() && selected.LocalPort == activePort && address != null)
                            VerifyPublicAsync(selected.Id, address);
                    });
                }
                catch (Exception error)
                {
                    OnUi(delegate { sakuraRefreshBusy = false; sakuraClientLabel.Text = "客户端状态：" + SakuraBridge.ClientState() + " · 隧道读取失败"; UpdateTunnelPanel(); });
                    Log("读取 SakuraFrp 现有隧道失败：" + SafeError(error));
                }
            });
        }

        private static string SafeError(Exception error)
        {
            WebException web = error as WebException;
            if (web != null) return "官方 API 请求失败（" + web.Status + "）";
            return error is InvalidOperationException ? error.Message : error.GetType().Name;
        }

        private void VerifyPublicAsync(int tunnelId, string address)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                bool verified = SakuraBridge.CheckPublicGame(address);
                OnUi(delegate
                {
                    TunnelInfo current = SelectedTunnel();
                    if (current == null || current.Id != tunnelId) return;
                    publicVerified = verified;
                    UpdateTunnelPanel();
                    Log(verified ? "公网网页、健康检查和 Socket.IO 轮询均已响应；仍需远程设备验证完整操作。" : "公网地址尚未通过网页与 Socket.IO 检查，未标记为可用。");
                });
            });
        }

        private void BeginTunnelStart()
        {
            if (!SakuraBridge.SupportsExternalTunnelControl) { Log("当前 SakuraFrp 客户端不支持外部启停；请在原客户端中启动选定隧道。"); return; }
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null || tunnelBusy) return;
            if (!IsRunning() || tunnel.LocalPort != activePort)
            { Log("端口不匹配或游戏尚未运行，不能启动选定隧道。请先将游戏启动在隧道目标端口。"); return; }
            if (tunnel.Online) { Log("所选隧道已经在线，不会重复启动。"); return; }
            tunnelBusy = true; UpdateTunnelPanel();
            int tunnelId = tunnel.Id;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    Process process = SakuraBridge.StartOwnedTunnel(tunnel, delegate(string line) { Log("frpc：" + line); });
                    ownedTunnel = process; ownedTunnelId = tunnelId;
                    Log("已通过现有 frpc 启动隧道 #" + tunnelId + "，进程 PID " + process.Id + "；正在检查连接。");
                    process.Exited += delegate
                    {
                        Log("本启动器启动的隧道进程已退出，代码 " + process.ExitCode + "。");
                        OnUi(delegate { publicVerified = false; UpdateTunnelPanel(); RefreshTunnels(); });
                    };
                    DateTime deadline = DateTime.UtcNow.AddSeconds(30);
                    while (DateTime.UtcNow < deadline && !process.HasExited)
                    {
                        Thread.Sleep(1500);
                        List<TunnelInfo> current = SakuraBridge.ReadTunnels();
                        TunnelInfo active = current.Find(item => item.Id == tunnelId);
                        if (active != null && active.Online)
                        {
                            OnUi(delegate { tunnels = current; TunnelInfo selected = SelectedTunnel(); if (selected != null && selected.Id == tunnelId) { selected.Online = true; selected.PublicAddress = active.PublicAddress; UpdateTunnelPanel(); } });
                            string address = active.PublicAddress;
                            if (String.IsNullOrWhiteSpace(address)) manualAddresses.TryGetValue(tunnelId, out address);
                            if (address != null) VerifyPublicAsync(tunnelId, address);
                            Log("SakuraFrp 官方 API 已确认隧道 #" + tunnelId + " 在线。");
                            return;
                        }
                    }
                    Log("30 秒内未确认隧道在线；游戏服务器仍可在本地使用。");
                }
                catch (Exception error) { Log("启动隧道失败：" + SafeError(error) + "；游戏服务器仍可在本地使用。"); }
                finally { OnUi(delegate { tunnelBusy = false; UpdateTunnelPanel(); RefreshTunnels(); }); }
            });
        }

        private void BeginTunnelStop()
        {
            if (!SakuraBridge.SupportsExternalTunnelControl) { Log("当前 SakuraFrp 客户端不支持外部启停；请在原客户端中停止选定隧道。"); return; }
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null || tunnel.Id != ownedTunnelId || tunnelBusy) return;
            tunnelBusy = true; UpdateTunnelPanel();
            ThreadPool.QueueUserWorkItem(delegate
            {
                StopOwnedTunnel();
                OnUi(delegate { tunnelBusy = false; publicVerified = false; UpdateTunnelPanel(); RefreshTunnels(); });
            });
        }

        private void StopOwnedTunnel()
        {
            Process process = ownedTunnel;
            if (process == null) return;
            try
            {
                if (!process.HasExited)
                {
                    int pid = process.Id;
                    if (!process.CloseMainWindow() || !process.WaitForExit(2500)) { process.Kill(); process.WaitForExit(3000); }
                    Log("仅停止本启动器创建的 SakuraFrp frpc 进程 PID " + pid + "。");
                }
            }
            catch (Exception error) { Log("停止本启动器的隧道进程失败：" + SafeError(error)); }
            ownedTunnel = null; ownedTunnelId = 0;
        }

        private void OnTunnelSelected()
        {
            TunnelInfo tunnel = SelectedTunnel();
            preferredTunnelId = tunnel == null ? 0 : tunnel.Id;
            publicVerified = false;
            SavePreferences();
            UpdateTunnelPanel();
        }

        private void UseTunnelPort()
        {
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null || IsRunning()) return;
            portInput.Value = tunnel.LocalPort;
            Log("已将待启动游戏端口设为现有隧道的目标端口 " + tunnel.LocalPort + "；隧道配置未改动。");
            UpdateTunnelPanel();
        }

        private void SaveManualAddress()
        {
            TunnelInfo tunnel = SelectedTunnel();
            if (tunnel == null) return;
            string entered = manualAddressInput.Text.Trim();
            Uri address;
            if (!Uri.TryCreate(entered, UriKind.Absolute, out address) ||
                (address.Scheme != "http" && address.Scheme != "https") || String.IsNullOrWhiteSpace(address.Host))
            { Log("手动地址必须是完整的 http:// 或 https:// 访问地址。"); return; }
            manualAddresses[tunnel.Id] = entered.TrimEnd('/');
            SavePreferences();
            publicVerified = false;
            Log("已保存用户配置的公网地址；尚未验证，未修改 SakuraFrp 隧道。");
            UpdateTunnelPanel();
        }

        private void LoadPreferences()
        {
            try
            {
                if (!File.Exists(preferenceFile)) return;
                Dictionary<string, object> value = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(preferenceFile, Encoding.UTF8));
                object selected;
                if (value.TryGetValue("selectedTunnelId", out selected)) int.TryParse(Convert.ToString(selected), out preferredTunnelId);
                object addresses;
                Dictionary<string, object> saved = value.TryGetValue("manualAddresses", out addresses) ? addresses as Dictionary<string, object> : null;
                if (saved == null) return;
                foreach (KeyValuePair<string, object> pair in saved)
                {
                    int id; Uri parsed;
                    if (int.TryParse(pair.Key, out id) && Uri.TryCreate(Convert.ToString(pair.Value), UriKind.Absolute, out parsed) &&
                        (parsed.Scheme == "http" || parsed.Scheme == "https")) manualAddresses[id] = parsed.AbsoluteUri.TrimEnd('/');
                }
            }
            catch { /* 无效的个人偏好不会阻止启动游戏 */ }
        }

        private void SavePreferences()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(preferenceFile));
                Dictionary<string, object> value = new Dictionary<string, object>();
                value["selectedTunnelId"] = preferredTunnelId;
                value["manualAddresses"] = manualAddresses.ToDictionary(pair => pair.Key.ToString(), pair => pair.Value);
                File.WriteAllText(preferenceFile, serializer.Serialize(value), new UTF8Encoding(false));
            }
            catch { Log("无法保存启动器偏好设置；不影响游戏和隧道配置。"); }
        }

        private void OpenSakuraClient()
        {
            string directory = SakuraBridge.InstallDirectory;
            if (directory == null) { Log("未找到已安装的 SakuraFrp 客户端。"); return; }
            try { Process.Start(new ProcessStartInfo(Path.Combine(directory, "SakuraLauncher.exe")) { UseShellExecute = true }); }
            catch (Exception error) { Log("打开 SakuraFrp 客户端失败：" + error.Message); }
        }

        private void OpenPublicGame()
        {
            string address = CurrentPublicAddress();
            if (!publicVerified || address == null) return;
            try { Process.Start(new ProcessStartInfo(address) { UseShellExecute = true }); }
            catch (Exception error) { Log("打开公网游戏失败：" + error.Message); }
        }

        private void OnUi(Action action)
        {
            if (IsDisposed || Disposing) return;
            try { if (InvokeRequired) BeginInvoke(action); else action(); }
            catch (InvalidOperationException) { /* 正在关闭窗口 */ }
        }

        private void Log(string message)
        {
            if (message.IndexOf("token", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("secret", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.TrimStart().StartsWith("{")) return;
            string line = "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + message;
            OnUi(delegate
            {
                if (logBox != null) { logBox.AppendText(line + Environment.NewLine); logBox.SelectionStart = logBox.TextLength; logBox.ScrollToCaret(); }
            });
            try { Directory.CreateDirectory(Path.GetDirectoryName(logFile)); File.AppendAllText(logFile, line + Environment.NewLine, Encoding.UTF8); }
            catch { /* 日志目录不可写时仍显示在窗口 */ }
        }

        private void SetStatus(string text, Color color)
        {
            OnUi(delegate { statusLabel.Text = "服务器状态：● " + text; statusLabel.ForeColor = color; UpdateButtons(); });
        }

        private bool IsRunning()
        {
            lock (processLock)
            {
                try { return serverProcess != null && !serverProcess.HasExited; }
                catch { return false; }
            }
        }

        private void UpdateButtons()
        {
            bool running = IsRunning();
            startButton.Enabled = !busy && !running;
            stopButton.Enabled = !busy && running;
            restartButton.Enabled = !busy && running;
            openButton.Enabled = !busy && running && localAddress != null;
            copyLocalButton.Enabled = localAddress != null;
            copyLanButton.Enabled = lanAddress != null;
            portInput.Enabled = !busy && !running;
            if (tunnelSelector != null) UpdateTunnelPanel();
        }

        private void SetBusy(bool value)
        {
            OnUi(delegate { busy = value; UpdateButtons(); });
        }

        private void RefreshPorts()
        {
            if (busy) return;
            int selected = (int)portInput.Value;
            portList.Items.Clear();
            List<ListViewItem> rows = new List<ListViewItem>();
            foreach (int port in CommonPorts.Concat(new[] { selected }).Distinct())
            {
                ListViewItem row = new ListViewItem(port.ToString());
                row.SubItems.Add("检测中"); row.SubItems.Add("请稍候"); row.ForeColor = Color.Gray;
                portList.Items.Add(row);
                rows.Add(row);
            }
            ThreadPool.QueueUserWorkItem(delegate
            {
                foreach (ListViewItem row in rows)
                {
                    int port = int.Parse(row.Text);
                    PortResult result = PortScanner.Check(port);
                    OnUi(delegate
                    {
                        if (row.ListView == null) return;
                        row.SubItems[1].Text = result.State == PortState.Available ? "● 可用" : result.State == PortState.Occupied ? "● 已占用" : "● 未知";
                        row.SubItems[2].Text = result.Detail;
                        row.ForeColor = result.State == PortState.Available ? Color.ForestGreen : result.State == PortState.Occupied ? Color.Firebrick : Color.Gray;
                    });
                }
            });
        }

        private Dictionary<string, object> ReadConfiguration()
        {
            string path = Path.Combine(gameDirectory, "config.json");
            if (!File.Exists(path)) throw new InvalidOperationException("缺少 GameServer/config.json，请重新解压完整便携包。");
            Dictionary<string, object> config = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(path, Encoding.UTF8));
            if (config == null || !config.ContainsKey("bindAddress") || !config.ContainsKey("maxRooms"))
                throw new InvalidOperationException("config.json 缺少 bindAddress 或 maxRooms。");
            string bind = Convert.ToString(config["bindAddress"]);
            IPAddress parsed;
            if (!IPAddress.TryParse(bind, out parsed)) throw new InvalidOperationException("config.json 的 bindAddress 不是有效 IP 地址。");
            int maxRooms;
            if (!int.TryParse(Convert.ToString(config["maxRooms"]), out maxRooms) || maxRooms < 1 || maxRooms > 1000)
                throw new InvalidOperationException("config.json 的 maxRooms 必须是 1～1000。");
            activeBind = bind;
            return config;
        }

        private void SavePort(Dictionary<string, object> config, int port)
        {
            config["port"] = port;
            string path = Path.Combine(gameDirectory, "config.json");
            File.WriteAllText(path, serializer.Serialize(config), new UTF8Encoding(false));
        }

        private void VerifyFiles()
        {
            foreach (string relative in new[] { "GameServer.exe", "launcher.cjs", "stop.cjs", "config.json", Path.Combine("web", "index.html"), "server.cjs" })
                if (!File.Exists(Path.Combine(gameDirectory, relative)))
                    throw new InvalidOperationException("缺少 GameServer/" + relative + "，请重新解压完整便携包。");
        }

        private void BeginStart()
        {
            if (busy || IsRunning()) return;
            int port = (int)portInput.Value;
            bool startTunnelAfterHealth = autoStartTunnel.Checked;
            TunnelInfo autoTunnel = SelectedTunnel();
            SetBusy(true); SetStatus("正在启动", Color.DarkOrange);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    StartCore(port);
                    if (startTunnelAfterHealth && autoTunnel != null)
                        OnUi(delegate { BeginTunnelStart(); });
                }
                catch (Exception error)
                {
                    Log("启动失败：" + error.Message);
                    SetStatus("启动失败：" + error.Message, Color.Firebrick);
                    ClearAddresses();
                    Process owned;
                    lock (processLock) owned = serverProcess;
                    if (owned != null && !owned.HasExited) StopCore();
                }
                finally { SetBusy(false); }
            });
        }

        private void StartCore(int port)
        {
            if (port < 1 || port > 65535) throw new InvalidOperationException("端口必须在 1～65535 之间。");
            VerifyFiles();
            Dictionary<string, object> config = ReadConfiguration();
            PortResult result = PortScanner.Check(port);
            if (result.State != PortState.Available)
                throw new InvalidOperationException("端口 " + port + (result.State == PortState.Occupied ? " 已占用：" : " 状态未知：") + result.Detail);
            SavePort(config, port);
            activePort = port;
            Log("正在启动生产游戏服务器，端口 " + port + "，监听地址 " + activeBind + "。");
            ProcessStartInfo info = new ProcessStartInfo(Path.Combine(gameDirectory, "GameServer.exe"), "launcher.cjs");
            info.WorkingDirectory = gameDirectory;
            info.UseShellExecute = false; info.CreateNoWindow = true;
            info.RedirectStandardOutput = true; info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8; info.StandardErrorEncoding = Encoding.UTF8;
            Process process = new Process(); process.StartInfo = info; process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null && !e.Data.TrimStart().StartsWith("{")) Log("服务端：" + e.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null && !e.Data.TrimStart().StartsWith("{")) Log("服务端错误：" + e.Data); };
            process.Exited += delegate
            {
                bool unexpected;
                lock (processLock) { unexpected = serverProcess == process && !stopping; if (serverProcess == process) serverProcess = null; }
                if (unexpected)
                {
                    Log("游戏服务器异常退出，退出码 " + process.ExitCode + "。");
                    ClearAddresses(); SetStatus("异常退出（退出码 " + process.ExitCode + "）", Color.Firebrick);
                    OnUi(UpdateButtons);
                }
            };
            if (!process.Start()) throw new InvalidOperationException("GameServer.exe 未能启动。");
            lock (processLock) serverProcess = process;
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            Log("已创建服务进程 PID " + process.Id + "，等待网页、Socket.IO 和健康检查。");
            DateTime deadline = DateTime.UtcNow.AddSeconds(20);
            bool healthy = false;
            while (DateTime.UtcNow < deadline)
            {
                if (process.HasExited) throw new InvalidOperationException("服务进程提前退出，退出码 " + process.ExitCode + "。请查看窗口日志。");
                if (CheckHttp(port)) { healthy = true; break; }
                Thread.Sleep(300);
            }
            if (!healthy) throw new InvalidOperationException("20 秒内网页、Socket.IO 或 /health 未全部就绪。");
            localAddress = "http://localhost:" + port;
            string lan = DetectLan();
            lanAddress = activeBind == "0.0.0.0" || activeBind == lan ? (lan == null ? null : "http://" + lan + ":" + port) : null;
            OnUi(delegate
            {
                localLabel.Text = "本机地址：" + localAddress;
                lanLabel.Text = lanAddress == null ? "局域网地址：不可用（未检测到可用地址或服务器仅监听本机）" : "局域网地址：" + lanAddress;
                UpdateButtons();
            });
            Log("端口 " + port + " 绑定成功；网页、Socket.IO 与健康检查均已响应。");
            if (lanAddress != null) Log("局域网地址：" + lanAddress + "（仅同一局域网可达性待网络验证）。");
            SetStatus("运行中 · 端口 " + port, Color.ForestGreen);
        }

        private static bool CheckHttp(int port)
        {
            try
            {
                string health = Get("http://127.0.0.1:" + port + "/health");
                if (!health.Contains("\"ok\":true")) return false;
                if (!Get("http://127.0.0.1:" + port + "/").Contains("肘击大乱斗")) return false;
                return Get("http://127.0.0.1:" + port + "/socket.io/?EIO=4&transport=polling").StartsWith("0{");
            }
            catch { return false; }
        }

        private static string Get(string address)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(address);
            request.Timeout = 1200; request.ReadWriteTimeout = 1200;
            request.Proxy = null;
            using (WebResponse response = request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) return reader.ReadToEnd();
        }

        private static string DetectLan()
        {
            try
            {
                foreach (NetworkInterface network in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (network.OperationalStatus != OperationalStatus.Up || network.NetworkInterfaceType == NetworkInterfaceType.Loopback || network.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                    foreach (UnicastIPAddressInformation address in network.GetIPProperties().UnicastAddresses)
                    {
                        if (address.Address.AddressFamily != AddressFamily.InterNetwork || IPAddress.IsLoopback(address.Address)) continue;
                        byte[] bytes = address.Address.GetAddressBytes();
                        bool privateLan = bytes[0] == 10 || bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31 || bytes[0] == 192 && bytes[1] == 168;
                        if (privateLan) return address.Address.ToString();
                    }
                }
            }
            catch { /* 不显示未经验证的地址 */ }
            return null;
        }

        private void BeginStop(bool restart)
        {
            if (busy || !IsRunning()) return;
            int port = activePort;
            bool stopTunnelWithGame = autoStopTunnel.Checked;
            SetBusy(true); SetStatus(restart ? "正在重启" : "正在停止", Color.DarkOrange);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { if (stopTunnelWithGame) StopOwnedTunnel(); StopCore(); if (restart) { SetStatus("正在重启", Color.DarkOrange); StartCore(port); } }
                catch (Exception error) { Log((restart ? "重启" : "停止") + "失败：" + error.Message); SetStatus("错误：" + error.Message, Color.Firebrick); }
                finally { SetBusy(false); }
            });
        }

        private void StopCore()
        {
            publicVerified = false;
            Process owned;
            lock (processLock) { owned = serverProcess; stopping = true; }
            if (owned == null) { stopping = false; ClearAddresses(); return; }
            Log("正在优雅停止本启动器创建的服务进程 PID " + owned.Id + "。");
            if (!owned.HasExited)
            {
                try
                {
                    ProcessStartInfo stopInfo = new ProcessStartInfo(Path.Combine(gameDirectory, "GameServer.exe"), "stop.cjs");
                    stopInfo.WorkingDirectory = gameDirectory; stopInfo.UseShellExecute = false; stopInfo.CreateNoWindow = true;
                    stopInfo.RedirectStandardOutput = true; stopInfo.RedirectStandardError = true;
                    using (Process stopper = Process.Start(stopInfo))
                    {
                        string output = stopper.StandardOutput.ReadToEnd();
                        string error = stopper.StandardError.ReadToEnd();
                        stopper.WaitForExit(5000);
                        if (stopper.ExitCode != 0) Log("优雅停止请求未完成：" + error.Trim());
                        else Log(output.Trim());
                    }
                }
                catch (Exception error) { Log("优雅停止请求失败：" + error.Message); }
                if (!owned.WaitForExit(6000))
                {
                    Log("优雅停止超时，仅终止本启动器创建的 PID " + owned.Id + "。");
                    owned.Kill(); owned.WaitForExit(3000);
                }
            }
            lock (processLock) { if (serverProcess == owned) serverProcess = null; stopping = false; }
            ClearAddresses();
            PortResult result = PortScanner.Check(activePort);
            if (result.State == PortState.Available) Log("服务器已停止，端口 " + activePort + " 已释放。");
            else Log("服务器已退出；端口 " + activePort + " 当前状态：" + result.Detail);
            SetStatus("未启动", Color.Gray);
            OnUi(UpdateButtons);
        }

        private void ClearAddresses()
        {
            localAddress = null; lanAddress = null;
            OnUi(delegate
            {
                localLabel.Text = "本机地址：尚未启动";
                lanLabel.Text = "局域网地址：尚未启动";
                UpdateButtons();
            });
        }

        private void OpenGame()
        {
            if (localAddress == null) return;
            try { Process.Start(new ProcessStartInfo(localAddress) { UseShellExecute = true }); }
            catch (Exception error) { Log("打开浏览器失败：" + error.Message); }
        }

        private void CopyAddress(string address)
        {
            if (address == null) return;
            try { Clipboard.SetText(address); Log("访问地址已复制：" + address); }
            catch (Exception error) { Log("复制地址失败：" + error.Message); }
        }

        private void HandleClosing(object sender, FormClosingEventArgs args)
        {
            if (closeAfterStop) return;
            if (!IsRunning()) { StopOwnedTunnel(); return; }
            args.Cancel = true;
            if (busy) return;
            SetBusy(true);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { StopOwnedTunnel(); StopCore(); }
                finally { OnUi(delegate { closeAfterStop = true; Close(); }); }
            });
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }
}
