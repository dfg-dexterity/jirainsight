// 📞 Dexterity Call Tracking — detector de chamadas do Jira Insights (macOS 12+)
//
// Fica na barra de menus e percebe quando um app começa a usar o MICROFONE — Teams,
// WhatsApp, Google Meet (no navegador), Zoom, FaceTime, Slack… Quando a chamada termina,
// mostra um pop-up para 📝 criar o ticket daquela reunião ou ⏱ apontar as horas num
// ticket que já existe. O formulário abre no Jira Insights (📞 Chamadas) com app, início,
// fim e duração preenchidos — é lá que moram a sua identidade do Jira e o catálogo.
//
// Como sabe quem está na chamada: no macOS 14.2+ o Core Audio lista os processos de áudio
// e diz quais estão captando o microfone (kAudioProcessPropertyIsRunningInput) — nunca o
// áudio em si. Antes do 14.2 só dá para saber que o microfone está em uso; o app então
// supõe o app de chamada aberto e marca a chamada como "provável".
// Chamada no navegador: com a sua permissão de Automação, lê o endereço e o título das
// abas para reconhecer meet.google.com, teams.microsoft.com, web.whatsapp.com…
//
// Privacidade: nada sai do Mac sozinho. A chamada vai para o painel no FRAGMENTO da URL
// (#ct=…), que o navegador nunca manda ao servidor; o painel guarda no SEU navegador até
// você apontar. Sem áudio, sem gravação, sem conteúdo da conversa.
//
// Instalar:  curl -fsSL https://jirainsight.vercel.app/call-tracking/instalar.sh | bash
// Compilar:  xcrun swiftc -O -parse-as-library -o DexterityCallTracking CallTracking.swift
// Modos:     (sem argumento) app da barra de menus · --selftest · --probe · --demo [s] · --version
// Dados:     ~/Library/Application Support/DexterityCallTracking (config.json, pendentes.json)
//            — CT_DADOS muda a pasta (testes); CT_PAINEL muda o endereço do painel.

import AppKit
import CoreAudio
import Darwin

let CT_VERSAO = "1.0.0"
let CT_BUNDLE = "br.com.dexterityit.calltracking"
let CT_EXE = "DexterityCallTracking"

// MARK: - Modelo

/// Um app que está captando o microfone agora.
struct AppMic: Equatable {
    var key: String     // chave estável: teams, whatsapp, chrome… (ou o bundle id)
    var rot: String     // rótulo para a tela
    var bid: String     // bundle id de quem capta o áudio
    var nav: Bool       // é navegador (a chamada pode ser Meet/Teams/WhatsApp Web)
    var provavel = false
}

/// Uma chamada encerrada, pronta para virar ticket ou apontamento.
struct Chamada: Codable, Equatable {
    var id: String
    var app: String
    var rot: String
    var bid: String
    var ini: Date
    var fim: Date
    var tit: String?
    var host: String?
    var provavel: Bool?
    var seg: Int { max(0, Int(fim.timeIntervalSince(ini).rounded())) }
}

struct Config: Codable, Equatable {
    var painel = "https://jirainsight.vercel.app"
    var minSeg = 120            // chamadas mais curtas são descartadas
    var folgaSeg = 20           // microfone solto por menos que isso = mesma chamada
    var ignorar: [String] = []  // chaves (ou bundle ids) que nunca viram chamada
    var abrirEm = "padrao"      // padrao | chrome | edge (janela pop-up do navegador)
    var lerAbas = true          // reconhecer a chamada pelas abas do navegador
    var som = true
    var pausadoAte: Date?
    var vistos: [String: String] = [:]   // apps já vistos no microfone (chave → rótulo)

    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        let p = Config()
        painel = try c.decodeIfPresent(String.self, forKey: .painel) ?? p.painel
        minSeg = try c.decodeIfPresent(Int.self, forKey: .minSeg) ?? p.minSeg
        folgaSeg = try c.decodeIfPresent(Int.self, forKey: .folgaSeg) ?? p.folgaSeg
        ignorar = try c.decodeIfPresent([String].self, forKey: .ignorar) ?? p.ignorar
        abrirEm = try c.decodeIfPresent(String.self, forKey: .abrirEm) ?? p.abrirEm
        lerAbas = try c.decodeIfPresent(Bool.self, forKey: .lerAbas) ?? p.lerAbas
        som = try c.decodeIfPresent(Bool.self, forKey: .som) ?? p.som
        pausadoAte = try c.decodeIfPresent(Date.self, forKey: .pausadoAte)
        vistos = try c.decodeIfPresent([String: String].self, forKey: .vistos) ?? p.vistos
    }
}

// MARK: - Catálogo de apps

enum Catalogo {
    /// prefixo do bundle id → (chave, rótulo, é navegador)
    static let apps: [(String, String, String, Bool)] = [
        ("com.microsoft.teams", "teams", "Microsoft Teams", false),
        ("net.whatsapp.WhatsApp", "whatsapp", "WhatsApp", false),
        ("desktop.WhatsApp", "whatsapp", "WhatsApp", false),
        ("us.zoom", "zoom", "Zoom", false),
        ("com.apple.FaceTime", "facetime", "FaceTime", false),
        ("com.apple.avconferenced", "facetime", "FaceTime", false),
        ("com.apple.TelephonyUtilities", "telefone", "Telefone (iPhone)", false),
        ("com.tinyspeck.slackmacgap", "slack", "Slack", false),
        ("com.cisco.webexmeetingsapp", "webex", "Webex", false),
        ("Cisco-Systems.Spark", "webex", "Webex", false),
        ("com.hnc.Discord", "discord", "Discord", false),
        ("com.skype.skype", "skype", "Skype", false),
        ("ru.keepcoder.Telegram", "telegram", "Telegram", false),
        ("org.telegram.desktop", "telegram", "Telegram", false),
        ("com.google.Chrome", "chrome", "Google Chrome", true),
        ("com.microsoft.edgemac", "edge", "Microsoft Edge", true),
        ("com.apple.Safari", "safari", "Safari", true),
        ("com.apple.WebKit", "safari", "Safari", true),     // o áudio do Safari passa pelo WebKit.GPU
        ("company.thebrowser.Browser", "arc", "Arc", true),
        ("com.brave.Browser", "brave", "Brave", true),
        ("org.mozilla.firefox", "firefox", "Firefox", true),
        ("com.operasoftware.Opera", "opera", "Opera", true),
        ("com.vivaldi.Vivaldi", "vivaldi", "Vivaldi", true),
    ]
    /// quem usa o microfone sem ser chamada (ditado, Siri, reconhecimento de sons…)
    static let sempreIgnorar = [
        CT_BUNDLE, "com.apple.SpeechRecognitionCore", "com.apple.corespeechd", "com.apple.assistantd",
        "com.apple.Siri", "com.apple.siri", "com.apple.dictation", "com.apple.DictationIM",
        "com.apple.accessibility.heard", "com.apple.VoiceOver", "com.apple.controlcenter", "com.apple.audio.",
        "com.apple.CoreSpeech", "com.apple.universalaccessd", "com.apple.cmio.", "com.apple.mediaremoted",
        "com.apple.AirPlayXPCHelper", "com.apple.VoiceMemos", "com.apple.voicememod",
    ]

    static func classifica(bid: String, nome: String?) -> AppMic? {
        for p in sempreIgnorar where bid.hasPrefix(p) { return nil }
        for (pre, key, rot, nav) in apps where bid.hasPrefix(pre) {
            return AppMic(key: key, rot: rot, bid: bid, nav: nav)
        }
        let n = (nome ?? "").trimmingCharacters(in: .whitespaces)
        let rot = n.isEmpty ? (bid.isEmpty ? "Outro app" : bid) : n
        return AppMic(key: bid.isEmpty ? "outro:" + rot : bid, rot: rot, bid: bid, nav: false)
    }

    /// Antes do macOS 14.2: o microfone está em uso, mas não dá para saber por quem.
    /// Supõe o app de chamada aberto (o da frente primeiro; navegador só se nada mais). Sem app de chamada
    /// aberto não é chamada (ditado, gravador…) — devolve nil.
    static func provavel(rodando: [(bid: String, frente: Bool)]) -> (app: AppMic, frente: Bool)? {
        var melhor: (AppMic, Int, Bool)?
        for r in rodando {
            guard let a = classifica(bid: r.bid, nome: nil), apps.contains(where: { r.bid.hasPrefix($0.0) }) else { continue }
            let nota = (a.nav ? 0 : 10) + (r.frente ? 5 : 0)
            if melhor == nil || nota > melhor!.1 { melhor = (a, nota, r.frente) }
        }
        guard var m = melhor else { return nil }
        m.0.provavel = true
        return (m.0, m.2)
    }
}

// MARK: - Core Audio

enum Microfone {
    // Seletores dos processos de áudio (macOS 14.2+) pelo código de 4 letras: o SDK do macOS 12/13 não tem estes
    // nomes, e com eles o detector não compilava nesses Macs. O --selftest confere contra o SDK novo (na CI).
    static let selProcessos: AudioObjectPropertySelector = 0x7072_7323   // 'prs#' ProcessObjectList
    static let selPID: AudioObjectPropertySelector = 0x7070_6964         // 'ppid' Process PID
    static let selBundle: AudioObjectPropertySelector = 0x7062_6964      // 'pbid' Process BundleID
    static let selEntrada: AudioObjectPropertySelector = 0x7069_7269     // 'piri' Process IsRunningInput

    static func endereco(_ sel: AudioObjectPropertySelector, _ escopo: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: sel, mScope: escopo, mElement: kAudioObjectPropertyElementMain)
    }
    static func lerU32(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> UInt32? {
        var a = endereco(sel); var v: UInt32 = 0; var t = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(obj, &a, 0, nil, &t, &v) == noErr ? v : nil
    }
    static func lerPID(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> pid_t? {
        var a = endereco(sel); var v: pid_t = 0; var t = UInt32(MemoryLayout<pid_t>.size)
        return AudioObjectGetPropertyData(obj, &a, 0, nil, &t, &v) == noErr ? v : nil
    }
    static func lerTexto(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String? {
        var a = endereco(sel); var r: Unmanaged<CFString>?; var t = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(obj, &a, 0, nil, &t, &r) == noErr, let s = r else { return nil }
        return s.takeRetainedValue() as String
    }
    static func listaIDs(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> [AudioObjectID]? {
        var a = endereco(sel); var t: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(obj, &a, 0, nil, &t) == noErr else { return nil }
        var ids = [AudioObjectID](repeating: 0, count: Int(t) / MemoryLayout<AudioObjectID>.stride)
        if ids.isEmpty { return [] }
        guard AudioObjectGetPropertyData(obj, &a, 0, nil, &t, &ids) == noErr else { return nil }
        return Array(ids.prefix(Int(t) / MemoryLayout<AudioObjectID>.stride))
    }
    static func nomeDoProcesso(_ pid: pid_t) -> String? {
        var buf = [CChar](repeating: 0, count: 256)
        return proc_name(pid, &buf, UInt32(buf.count)) > 0 ? String(cString: buf) : nil
    }

    struct Processo { var pid: pid_t; var bid: String; var nome: String?; var entrada: Bool }

    /// Todos os processos de áudio (macOS 14.2+). nil = API indisponível.
    @available(macOS 14.2, *)
    static func processos() -> [Processo]? {
        guard let ids = listaIDs(AudioObjectID(kAudioObjectSystemObject), selProcessos) else { return nil }
        return ids.map { id in
            let pid = lerPID(id, selPID) ?? -1
            let app = pid > 0 ? NSRunningApplication(processIdentifier: pid) : nil
            var bid = lerTexto(id, selBundle) ?? ""
            if bid.isEmpty { bid = app?.bundleIdentifier ?? "" }
            let nome = app?.localizedName ?? (pid > 0 ? nomeDoProcesso(pid) : nil)
            return Processo(pid: pid, bid: bid, nome: nome, entrada: lerU32(id, selEntrada) == 1)
        }
    }

    /// Antes do 14.2: o microfone PADRÃO está ligado? `duplex` = o mesmo aparelho também toca som (fone com
    /// microfone, AirPods) — aí "ligado" pode ser só música, e o Core Audio não separa entrada de saída.
    static func entradaPadrao() -> (emUso: Bool, duplex: Bool) {
        guard let dev = lerU32(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultInputDevice), dev != 0 else { return (false, false) }
        var a = endereco(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput); var t: UInt32 = 0
        let saida = AudioObjectGetPropertyDataSize(dev, &a, 0, nil, &t) == noErr && t > 0
        return (lerU32(dev, kAudioDevicePropertyDeviceIsRunningSomewhere) == 1, saida)
    }
    // O palpite fica FIXO enquanto o microfone segue em uso: trocar de janela (Teams → Slack) não pode encerrar a
    // chamada e abrir outra com o nome do app da frente.
    private static var palpite: AppMic?
    private static var palpiteVisto = Date.distantPast

    /// Quem está captando o microfone agora. `fonte` diz como soubemos.
    static func usuarios() -> (apps: [AppMic], fonte: String) {
        if #available(macOS 14.2, *), let ps = processos() {
            var vistos = Set<String>(); var out: [AppMic] = []
            for p in ps where p.entrada {
                guard let a = Catalogo.classifica(bid: p.bid, nome: p.nome), vistos.insert(a.key).inserted else { continue }
                out.append(a)
            }
            return (out, "processos")
        }
        let (emUso, duplex) = entradaPadrao()
        let agora = Date()
        guard emUso else {
            if agora.timeIntervalSince(palpiteVisto) > 60 { palpite = nil }
            return ([], "dispositivo")
        }
        palpiteVisto = agora
        if palpite == nil {
            let frente = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
            let rodando = NSWorkspace.shared.runningApplications.compactMap { r -> (bid: String, frente: Bool)? in
                guard let b = r.bundleIdentifier else { return nil }
                return (b, b == frente)
            }
            // Fone com microfone: só conta como chamada se o app de chamada está NA FRENTE quando o aparelho liga
            // (senão é música/vídeo tocando no fone).
            if let p = Catalogo.provavel(rodando: rodando), !duplex || p.frente { palpite = p.app }
        }
        return (palpite.map { [$0] } ?? [], "dispositivo")
    }
}

// MARK: - Abas do navegador (chamada no Meet / Teams web / WhatsApp Web)

enum Abas {
    struct Achado: Equatable { var host: String; var rot: String; var tit: String }

    /// domínio → rótulo, em ordem de prioridade
    static let sites: [(String, String)] = [
        ("meet.google.com", "Google Meet"),
        ("teams.microsoft.com", "Teams (navegador)"),
        ("teams.live.com", "Teams (navegador)"),
        ("teams.cloud.microsoft", "Teams (navegador)"),
        ("web.whatsapp.com", "WhatsApp Web"),
        ("zoom.us", "Zoom (navegador)"),
        ("app.slack.com", "Slack (huddle)"),
        ("whereby.com", "Whereby"),
        ("meet.jit.si", "Jitsi"),
        ("discord.com", "Discord"),
    ]
    static let scripts: [String: String] = [
        "chrome": "com.google.Chrome", "edge": "com.microsoft.edgemac", "brave": "com.brave.Browser",
        "arc": "company.thebrowser.Browser", "vivaldi": "com.vivaldi.Vivaldi", "opera": "com.operasoftware.Opera",
        "safari": "com.apple.Safari",
    ]

    /// Sites cujo endereço não diz se a ligação está acontecendo (a aba fica aberta o dia todo): só contam na aba ativa.
    static func soAtiva(_ host: String) -> Bool {
        ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft", "web.whatsapp.com", "discord.com"]
            .contains { host == $0 || host.hasSuffix("." + $0) }
    }
    static func casa(url: String, titulo: String) -> Achado? {
        guard let u = URL(string: url), let h = u.host?.lowercased() else { return nil }
        for (site, rot) in sites where h == site || h.hasSuffix("." + site) {
            let p = u.path.lowercased()
            if site == "meet.google.com", p.range(of: "^/[a-z]{3}-[a-z]{4}-[a-z]{3}", options: .regularExpression) == nil { continue }
            if site == "zoom.us", !p.contains("/wc/") { continue }
            if site == "app.slack.com", !p.contains("huddle") { continue }
            if site == "discord.com", !p.hasPrefix("/channels/") { continue }
            let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
            return Achado(host: h, rot: rot, tit: String(t.prefix(120)))
        }
        return nil
    }
    static func prioridade(_ host: String) -> Int {
        sites.firstIndex { host == $0.0 || host.hasSuffix("." + $0.0) } ?? sites.count
    }
    /// "marca\tjanela\tURL\ttítulo\n…" (marca A = aba ativa da janela; janela 1 = a da frente) → a aba de
    /// chamada mais provável: ativa antes de fundo, janela da frente antes, depois a prioridade do site.
    static func melhor(_ texto: String) -> Achado? {
        var achados: [(Achado, Int, Int, Int)] = []
        for linha in texto.split(separator: "\n") {
            let p = linha.split(separator: "\t", maxSplits: 3, omittingEmptySubsequences: false).map(String.init)
            guard p.count >= 3, let a = casa(url: p[2], titulo: p.count > 3 ? p[3] : "") else { continue }
            let ativa = p[0] == "A"
            if !ativa && soAtiva(a.host) { continue }
            achados.append((a, ativa ? 0 : 1, Int(p[1]) ?? 99, prioridade(a.host)))
        }
        return achados.min { ($0.1, $0.2, $0.3) < ($1.1, $1.2, $1.3) }?.0
    }
    static func fonte(bid: String, safari: Bool) -> String {
        let titulo = safari ? "name" : "title"
        let ativa = safari ? "current tab" : "active tab"
        return """
        set sep to character id 9
        set nl to character id 10
        set saida to ""
        with timeout of 3 seconds
          tell application id "\(bid)"
            set n to 0
            repeat with w in windows
              set n to n + 1
              set ativa to ""
              try
                set ativa to URL of \(ativa) of w
              end try
              try
                repeat with t in tabs of w
                  try
                    set u to URL of t
                    set marca to "-"
                    if u is ativa then set marca to "A"
                    set saida to saida & marca & sep & (n as text) & sep & u & sep & (\(titulo) of t) & nl
                  end try
                end repeat
              end try
            end repeat
          end tell
        end timeout
        return saida
        """
    }
    /// Lê as abas do navegador `key` (só se ele estiver aberto — nunca abre o navegador).
    /// negado = a pessoa recusou a permissão de Automação (não insistir).
    static func procura(navegador key: String) -> (achado: Achado?, negado: Bool) {
        guard let bid = scripts[key], !NSRunningApplication.runningApplications(withBundleIdentifier: bid).isEmpty,
              let s = NSAppleScript(source: fonte(bid: bid, safari: key == "safari")) else { return (nil, false) }
        var erro: NSDictionary?
        let r = s.executeAndReturnError(&erro)
        if let e = erro { return (nil, (e[NSAppleScript.errorNumber] as? Int) == -1743) }
        return (melhor(r.stringValue ?? ""), false)
    }
}

// MARK: - Rastreador (máquina de estados — testada no --selftest)

final class Rastreador {
    struct EmCurso { var app: AppMic; var ini: Date; var visto: Date; var rot: String; var tit: String?; var host: String? }
    var minSeg: Double
    var folgaSeg: Double
    private(set) var emCurso: [String: EmCurso] = [:]
    private var ultimoTique: Date?

    init(minSeg: Double, folgaSeg: Double) { self.minSeg = minSeg; self.folgaSeg = folgaSeg }

    /// Um tique (a cada ~2 s): quem está no microfone agora. Devolve as chamadas que acabaram.
    func tique(_ agora: Date, ativos: [AppMic]) -> [Chamada] {
        var fim: [Chamada] = []
        // Mac dormiu (ou o app travou): o que estava em curso acabou quando o último tique o viu.
        if let u = ultimoTique, agora.timeIntervalSince(u) > max(60, folgaSeg * 3) { fim += encerraTodas() }
        ultimoTique = agora
        for a in ativos {
            if emCurso[a.key] != nil { emCurso[a.key]!.visto = agora }
            else { emCurso[a.key] = EmCurso(app: a, ini: agora, visto: agora, rot: a.rot, tit: nil, host: nil) }
        }
        let chaves = Set(ativos.map { $0.key })
        for (k, e) in emCurso where !chaves.contains(k) && agora.timeIntervalSince(e.visto) > folgaSeg {
            emCurso[k] = nil
            if let c = fecha(e) { fim.append(c) }
        }
        return fim.sorted { $0.ini < $1.ini }
    }
    func anota(_ key: String, _ a: Abas.Achado) {
        guard let e = emCurso[key] else { return }
        if let h = e.host, h != a.host { return }   // a 1ª aba de chamada achada fica: trocar de aba no meio não renomeia
        emCurso[key]!.rot = a.rot; emCurso[key]!.host = a.host
        if !a.tit.isEmpty { emCurso[key]!.tit = a.tit }
    }
    func encerraTodas() -> [Chamada] {
        let cs = emCurso.values.compactMap(fecha).sorted { $0.ini < $1.ini }
        emCurso = [:]
        return cs
    }
    func descarta() { emCurso = [:] }
    /// "Nunca perguntar para…" no meio da ligação: ela não vira pop-up quando acabar.
    func descarta(chave: String) { emCurso = emCurso.filter { $0.key != chave && $0.value.app.bid != chave } }
    private func fecha(_ e: EmCurso) -> Chamada? {
        guard e.visto.timeIntervalSince(e.ini) >= minSeg else { return nil }
        return Chamada(id: UUID().uuidString.lowercased(), app: e.app.key, rot: e.rot, bid: e.app.bid,
                       ini: e.ini, fim: e.visto, tit: e.tit, host: e.host, provavel: e.app.provavel ? true : nil)
    }
}

// MARK: - Armazém (config + pendentes no Application Support)

final class Armazem {
    let dir: URL
    init(dir: URL? = nil) {
        if let d = dir { self.dir = d }
        else if let e = ProcessInfo.processInfo.environment["CT_DADOS"], !e.isEmpty { self.dir = URL(fileURLWithPath: e, isDirectory: true) }
        else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSHomeDirectory() + "/Library/Application Support", isDirectory: true)
            self.dir = base.appendingPathComponent("DexterityCallTracking", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: self.dir, withIntermediateDirectories: true)
    }
    private var cfgURL: URL { dir.appendingPathComponent("config.json") }
    private var pendURL: URL { dir.appendingPathComponent("pendentes.json") }
    private func codificador() -> JSONEncoder {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; e.outputFormatting = [.prettyPrinted, .sortedKeys]; return e
    }
    private func decodificador() -> JSONDecoder { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }

    func config() -> Config {
        guard let d = try? Data(contentsOf: cfgURL), let c = try? decodificador().decode(Config.self, from: d) else { return Config() }
        return c
    }
    func salva(_ c: Config) { if let d = try? codificador().encode(c) { try? d.write(to: cfgURL, options: .atomic) } }
    private var enviURL: URL { dir.appendingPathComponent("enviadas.json") }
    private func le(_ u: URL) -> [Chamada] {
        guard let d = try? Data(contentsOf: u), let cs = try? decodificador().decode([Chamada].self, from: d) else { return [] }
        return cs
    }
    private func grava(_ cs: [Chamada], _ u: URL) { if let d = try? codificador().encode(cs) { try? d.write(to: u, options: .atomic) } }
    func pendentes() -> [Chamada] { le(pendURL) }
    func salva(_ cs: [Chamada]) { grava(cs, pendURL) }
    /// Já entregues ao painel (14 dias): o navegador pode ter aberto noutro perfil ou fechado antes de carregar —
    /// o menu reenvia (o painel junta por id e não duplica nem desfaz o que já foi apontado).
    func enviadas() -> [Chamada] { le(enviURL) }
    func salvaEnviadas(_ cs: [Chamada]) { grava(cs, enviURL) }
}

/// Pendentes: no máximo 50, nenhuma com mais de 14 dias.
func podaPendentes(_ cs: [Chamada], agora: Date = Date()) -> [Chamada] {
    let limite = agora.addingTimeInterval(-14 * 86_400)
    return Array(cs.filter { $0.fim >= limite }.sorted { $0.ini < $1.ini }.suffix(50))
}

// MARK: - Painel (Jira Insights)

enum Painel {
    static func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }
    static func json(_ c: Chamada) -> [String: Any] {
        var d: [String: Any] = ["id": c.id, "app": c.app, "rot": c.rot, "bid": c.bid,
                                "ini": iso(c.ini), "fim": iso(c.fim), "seg": c.seg]
        if let t = c.tit, !t.isEmpty { d["tit"] = t }
        if let h = c.host { d["host"] = h }
        if c.provavel == true { d["provavel"] = true }
        return d
    }
    static func base64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
    /// <painel>/?v=chamadas#ct=<base64url(JSON)>&m=<criar|apontar|lista>
    /// O payload vai no fragmento: o navegador nunca o manda ao servidor.
    static func url(base: String, chamadas: [Chamada], modo: String?) -> URL? {
        var b = base.trimmingCharacters(in: .whitespaces)
        while b.hasSuffix("/") { b.removeLast() }
        guard !b.isEmpty else { return nil }
        var frag = ""
        if !chamadas.isEmpty {
            let payload: [String: Any] = ["v": 1, "c": chamadas.map(json)]
            guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return nil }
            frag = "ct=" + base64url(data)
        }
        if let m = modo, !m.isEmpty { frag += (frag.isEmpty ? "" : "&") + "m=" + m }
        return URL(string: b + "/?v=chamadas" + (frag.isEmpty ? "" : "#" + frag))
    }
    /// `popup`: janela "pop-up" do navegador (sem abas/barra, mesmo perfil — identidade e login juntos); sem ela,
    /// uma janela normal do MESMO navegador (a lista 📞 mora no navegador que recebe as ligações).
    static func abre(_ url: URL, em: String, popup: Bool = true) {
        let apps = ["chrome": "Google Chrome", "edge": "Microsoft Edge"]
        if let app = apps[em] {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            p.arguments = popup ? ["-na", app, "--args", "--app=" + url.absoluteString, "--window-size=600,820"]
                                : ["-a", app, url.absoluteString]
            if (try? p.run()) != nil { p.waitUntilExit(); if p.terminationStatus == 0 { return } }
        }
        NSWorkspace.shared.open(url)
    }
}

// MARK: - Formatação

enum Fmt {
    static func hora(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: d) }
    static func dia(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "hoje" }
        if cal.isDateInYesterday(d) { return "ontem" }
        let f = DateFormatter(); f.dateFormat = "dd/MM"; return f.string(from: d)
    }
    static func dur(_ s: TimeInterval) -> String {
        let m = max(1, Int((s / 60).rounded()))
        return m < 60 ? "\(m) min" : String(format: "%dh%02d", m / 60, m % 60)
    }
    static func resumo(_ c: Chamada) -> String {
        "\(c.rot) · \(dia(c.ini)) \(hora(c.ini))–\(hora(c.fim)) · \(dur(TimeInterval(c.seg)))"
    }
}

// MARK: - Login (LaunchAgent)

enum Login {
    static var caminho: String { NSHomeDirectory() + "/Library/LaunchAgents/\(CT_BUNDLE).plist" }
    static var ativo: Bool { FileManager.default.fileExists(atPath: caminho) }
    static func xml(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
    static func plist(executavel: String, painel: String) -> String {
        let log = NSHomeDirectory() + "/Library/Logs/DexterityCallTracking.log"
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key><string>\(CT_BUNDLE)</string>
          <key>ProgramArguments</key><array><string>\(xml(executavel))</string></array>
          <key>EnvironmentVariables</key><dict><key>CT_PAINEL</key><string>\(xml(painel))</string></dict>
          <key>RunAtLoad</key><true/>
          <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
          <key>ProcessType</key><string>Interactive</string>
          <key>LimitLoadToSessionType</key><string>Aqua</string>
          <key>StandardOutPath</key><string>\(xml(log))</string>
          <key>StandardErrorPath</key><string>\(xml(log))</string>
        </dict>
        </plist>

        """
    }
    static func liga(painel: String) {
        guard let exe = Bundle.main.executablePath else { return }
        try? FileManager.default.createDirectory(atPath: NSHomeDirectory() + "/Library/LaunchAgents", withIntermediateDirectories: true)
        try? plist(executavel: exe, painel: painel).write(toFile: caminho, atomically: true, encoding: .utf8)
    }
    static func desliga() { try? FileManager.default.removeItem(atPath: caminho) }
}

// MARK: - Pop-up "chamada encerrada"

@MainActor
final class Popup: NSObject, NSWindowDelegate {
    weak var agente: Agente?
    private var painel: NSPanel?
    private var atual: Chamada?

    func mostra(_ c: Chamada, outras: Int) {
        atual = c
        let p = painel ?? criaPainel()
        painel = p
        let pilha = NSStackView()
        pilha.orientation = .vertical
        pilha.alignment = .leading
        pilha.spacing = 6
        pilha.edgeInsets = NSEdgeInsets(top: 30, left: 16, bottom: 14, right: 16)

        let titulo = NSTextField(labelWithString: "📞 Ligação encerrada" + (c.provavel == true ? " (app provável)" : ""))
        titulo.font = .boldSystemFont(ofSize: 14)
        pilha.addArrangedSubview(titulo)
        let linha = NSTextField(labelWithString: Fmt.resumo(c))
        linha.font = .systemFont(ofSize: 12.5)
        pilha.addArrangedSubview(linha)
        if let t = c.tit, !t.isEmpty {
            let l = NSTextField(labelWithString: t)
            l.font = .systemFont(ofSize: 12); l.textColor = .secondaryLabelColor
            l.lineBreakMode = .byTruncatingTail
            l.widthAnchor.constraint(lessThanOrEqualToConstant: 330).isActive = true
            pilha.addArrangedSubview(l)
        }
        let pergunta = NSTextField(labelWithString: "Registrar no Jira Insights:")
        pergunta.font = .systemFont(ofSize: 12); pergunta.textColor = .secondaryLabelColor
        pilha.addArrangedSubview(pergunta)

        let criar = botao("📝 Criar ticket", #selector(escolheCriar))
        let apontar = botao("⏱ Apontar em ticket", #selector(escolheApontar))
        apontar.keyEquivalent = "\r"
        let principais = NSStackView(views: [criar, apontar])
        principais.spacing = 8
        pilha.addArrangedSubview(principais)

        var rodape = [botao("Depois", #selector(escolheDepois), pequeno: true), botao("Ignorar", #selector(escolheIgnorar), pequeno: true)]
        if outras > 0 { rodape.append(botao("Ver todas (\(outras + 1))", #selector(escolheTodas), pequeno: true)) }
        let baixo = NSStackView(views: rodape)
        baixo.spacing = 6
        pilha.addArrangedSubview(baixo)

        p.contentView = pilha
        let tam = pilha.fittingSize
        p.setContentSize(NSSize(width: max(380, tam.width), height: tam.height))
        if let tela = NSScreen.main?.visibleFrame {
            p.setFrameOrigin(NSPoint(x: tela.maxX - p.frame.width - 16, y: tela.maxY - p.frame.height - 16))
        }
        p.orderFrontRegardless()
    }
    var aberto: Bool { painel?.isVisible == true }

    private func criaPainel() -> NSPanel {
        let p = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 160),
                        styleMask: [.titled, .closable, .nonactivatingPanel, .utilityWindow, .fullSizeContentView],
                        backing: .buffered, defer: false)
        p.title = "Call tracking"
        p.titleVisibility = .hidden
        p.titlebarAppearsTransparent = true
        p.isFloatingPanel = true
        p.level = .floating
        p.hidesOnDeactivate = false
        p.becomesKeyOnlyIfNeeded = true
        p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        p.delegate = self
        return p
    }
    private func botao(_ t: String, _ sel: Selector, pequeno: Bool = false) -> NSButton {
        let b = NSButton(title: t, target: self, action: sel)
        b.bezelStyle = .rounded
        if pequeno { b.controlSize = .small; b.font = .systemFont(ofSize: 11) }
        return b
    }
    private func escolhe(_ acao: String) {
        guard let c = atual else { return }
        atual = nil
        painel?.orderOut(nil)
        agente?.popupEscolheu(c, acao)
    }
    @objc func escolheCriar() { escolhe("criar") }
    @objc func escolheApontar() { escolhe("apontar") }
    @objc func escolheDepois() { escolhe("depois") }
    @objc func escolheIgnorar() { escolhe("ignorar") }
    @objc func escolheTodas() { escolhe("todas") }
    func windowWillClose(_ notification: Notification) { if atual != nil { escolhe("depois") } }
    func fecha() { atual = nil; painel?.orderOut(nil) }
    func salvaImagem(em caminho: String) {
        guard let v = painel?.contentView, let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { return }
        v.cacheDisplay(in: v.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: caminho))
    }
}

// MARK: - Agente (barra de menus)

@MainActor
final class Agente: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let armazem: Armazem
    var config: Config
    let rastreador: Rastreador
    var pendentes: [Chamada]
    var enviadas: [Chamada]
    var item: NSStatusItem?
    let popup: Popup
    var relogio: Timer?
    var fonte = ""
    var negados = Set<String>()
    var ultimaBusca: [String: Date] = [:]
    let demo: Double?

    init(demo: Double?) {
        let a = Armazem()
        var c = a.config()
        if let p = ProcessInfo.processInfo.environment["CT_PAINEL"], !p.isEmpty, p != c.painel { c.painel = p; a.salva(c) }
        armazem = a
        config = c
        rastreador = Rastreador(minSeg: Double(c.minSeg), folgaSeg: Double(c.folgaSeg))
        pendentes = podaPendentes(a.pendentes())
        enviadas = podaPendentes(a.enviadas())
        self.demo = demo
        popup = Popup()
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let it = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let m = NSMenu()
        m.delegate = self
        it.menu = m
        item = it
        popup.agente = self
        atualizaIcone()
        let t = Timer(timeInterval: 2, target: self, selector: #selector(tique), userInfo: nil, repeats: true)
        t.tolerance = 0.5
        RunLoop.main.add(t, forMode: .common)
        relogio = t
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(vaiDormir(_:)),
                                                          name: NSWorkspace.willSleepNotification, object: nil)
        if let s = demo {
            let fim = Date()
            let c = Chamada(id: "demo", app: "teams", rot: "Microsoft Teams", bid: "com.microsoft.teams2",
                            ini: fim.addingTimeInterval(-1980), fim: fim, tit: "Daily do projeto", host: nil, provavel: nil)
            popup.mostra(c, outras: 1)
            // A CI não baixa a captura de tela: o pop-up vira PNG (CT_DEMO_PNG) e o log mostra em base64.
            Timer.scheduledTimer(timeInterval: 1.5, target: self, selector: #selector(salvaDemo), userInfo: nil, repeats: false)
            Timer.scheduledTimer(timeInterval: s, target: NSApp as Any, selector: #selector(NSApplication.terminate(_:)), userInfo: nil, repeats: false)
        }
    }
    @objc func salvaDemo() {
        if let png = ProcessInfo.processInfo.environment["CT_DEMO_PNG"], !png.isEmpty { popup.salvaImagem(em: png) }
    }
    func applicationWillTerminate(_ notification: Notification) {
        guard demo == nil else { return }
        let cs = rastreador.encerraTodas()
        if !cs.isEmpty { pendentes = podaPendentes(pendentes + cs); armazem.salva(pendentes) }
    }

    var pausado: Bool { (config.pausadoAte ?? .distantPast) > Date() }

    @objc func tique() {
        guard demo == nil else { return }
        let agora = Date()
        if pausado { atualizaIcone(); return }
        if config.pausadoAte != nil { config.pausadoAte = nil; armazem.salva(config) }
        let (apps, f) = Microfone.usuarios()
        fonte = f
        let validos = apps.filter { !config.ignorar.contains($0.key) && !config.ignorar.contains($0.bid) }
        var novoVisto = false
        for a in validos where config.vistos[a.key] == nil { config.vistos[a.key] = a.rot; novoVisto = true }
        if novoVisto { armazem.salva(config) }
        let acabaram = rastreador.tique(agora, ativos: validos)
        if config.lerAbas {
            for (k, e) in rastreador.emCurso where e.app.nav && !negados.contains(e.app.key) {
                if let u = ultimaBusca[k], agora.timeIntervalSince(u) < (e.host == nil ? 15 : 60) { continue }
                ultimaBusca[k] = agora
                let r = Abas.procura(navegador: e.app.key)
                if r.negado { negados.insert(e.app.key) }
                if let a = r.achado { rastreador.anota(k, a) }
            }
        }
        for k in ultimaBusca.keys where rastreador.emCurso[k] == nil { ultimaBusca[k] = nil }
        for c in acabaram where !config.ignorar.contains(c.app) && !config.ignorar.contains(c.bid) { chegou(c) }
        atualizaIcone()
    }

    @objc func vaiDormir(_ n: Notification) {
        for c in rastreador.encerraTodas() { chegou(c) }
        atualizaIcone()
    }

    func chegou(_ c: Chamada) {
        pendentes = podaPendentes(pendentes + [c])
        armazem.salva(pendentes)
        if config.som { NSSound(named: NSSound.Name("Glass"))?.play() }
        popup.mostra(c, outras: max(0, pendentes.count - 1))
    }

    func popupEscolheu(_ c: Chamada, _ acao: String) {
        switch acao {
        case "criar", "apontar": entrega([c], modo: acao)
        case "ignorar": tira([c.id])
        case "todas": entrega(pendentes, modo: "lista")
        default: break   // depois: fica nos pendentes, no menu 📞
        }
        atualizaIcone()
    }

    /// Manda as chamadas ao painel. A partir daqui o painel é o dono delas.
    func entrega(_ cs: [Chamada], modo: String?) {
        guard let u = Painel.url(base: config.painel, chamadas: cs, modo: modo) else { return }
        Painel.abre(u, em: config.abrirEm)
        let ids = Set(cs.map(\.id))
        enviadas = podaPendentes(enviadas.filter { !ids.contains($0.id) } + cs)
        armazem.salvaEnviadas(enviadas)
        tira(Array(ids))
    }
    func tira(_ ids: [String]) {
        let s = Set(ids)
        pendentes.removeAll { s.contains($0.id) }
        armazem.salva(pendentes)
    }

    func atualizaIcone() {
        guard let b = item?.button else { return }
        let emCurso = rastreador.emCurso.values.min { $0.ini < $1.ini }
        let simbolo = pausado ? "phone.down" : (emCurso != nil ? "phone.fill" : "phone")
        if let img = NSImage(systemSymbolName: simbolo, accessibilityDescription: "Call tracking") {
            img.isTemplate = true
            b.image = img
            b.imagePosition = .imageLeading
        }
        var t = b.image == nil ? "📞" : ""
        if let e = emCurso { t += " " + Fmt.dur(Date().timeIntervalSince(e.ini)) }
        if !pendentes.isEmpty { t += " •\(pendentes.count)" }
        b.title = t
        b.toolTip = "Call tracking — " + (pausado ? "pausado" : (emCurso != nil ? "em chamada" : "ouvindo")) +
            (pendentes.isEmpty ? "" : " · \(pendentes.count) sem apontamento")
    }

    // MARK: menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        func add(_ t: String, _ sel: Selector?, _ obj: Any? = nil, marcado: Bool = false, em m: NSMenu? = nil) {
            let i = NSMenuItem(title: t, action: sel, keyEquivalent: "")
            if sel != nil { i.target = self }
            i.representedObject = obj
            i.state = marcado ? .on : .off
            (m ?? menu).addItem(i)
        }
        if pausado, let ate = config.pausadoAte {
            add("⏸ Pausado até \(Fmt.hora(ate))", nil)
        } else if rastreador.emCurso.isEmpty {
            add("Nenhuma chamada agora", nil)
        } else {
            for e in rastreador.emCurso.values.sorted(by: { $0.ini < $1.ini }) {
                add("🔴 Em chamada: \(e.rot) · \(Fmt.dur(Date().timeIntervalSince(e.ini)))", nil)
            }
        }
        menu.addItem(.separator())
        if pendentes.isEmpty {
            add("Nenhuma chamada sem apontamento", nil)
        } else {
            add("Sem apontamento (\(pendentes.count)) — clique para registrar:", nil)
            for c in pendentes.suffix(12).reversed() { add("   " + Fmt.resumo(c), #selector(abrePendente(_:)), c.id) }
            if pendentes.count > 1 { add("Registrar todas no Jira Insights…", #selector(enviaTodas)) }
            add("Descartar as pendentes", #selector(descartaPendentes))
        }
        if !enviadas.isEmpty {
            add("Reenviar ao painel as entregues (\(enviadas.count))…", #selector(reenvia))
        }
        menu.addItem(.separator())
        add("Abrir 📞 Ligações no Jira Insights", #selector(abreTela))
        add(pausado ? "▶ Retomar a detecção" : "⏸ Pausar por 1 hora", #selector(alternaPausa))

        let pref = NSMenu()
        let minimos = [60, 120, 300, 600]
        let durMenu = NSMenu()
        for s in minimos { add("\(s / 60) min", #selector(defineMinimo(_:)), s, marcado: config.minSeg == s, em: durMenu) }
        let durItem = NSMenuItem(title: "Duração mínima da chamada", action: nil, keyEquivalent: "")
        durItem.submenu = durMenu
        pref.addItem(durItem)
        let abrirMenu = NSMenu()
        for (k, t) in [("padrao", "Navegador padrão (nova aba)"), ("chrome", "Janela pop-up do Chrome"), ("edge", "Janela pop-up do Edge")] {
            add(t, #selector(defineAbrir(_:)), k, marcado: config.abrirEm == k, em: abrirMenu)
        }
        let abrirItem = NSMenuItem(title: "Abrir o formulário em", action: nil, keyEquivalent: "")
        abrirItem.submenu = abrirMenu
        pref.addItem(abrirItem)
        add("Reconhecer Meet/Teams/WhatsApp nas abas do navegador", #selector(alternaAbas), marcado: config.lerAbas, em: pref)
        add("Som ao encerrar a chamada", #selector(alternaSom), marcado: config.som, em: pref)
        add("Iniciar ao entrar no Mac", #selector(alternaLogin), marcado: Login.ativo, em: pref)
        let ign = NSMenu()
        let apps = config.vistos.merging(Dictionary(config.ignorar.map { ($0, $0) }, uniquingKeysWith: { a, _ in a })) { a, _ in a }
        if apps.isEmpty { add("(os apps aparecem aqui depois da 1ª chamada)", nil, em: ign) }
        for (k, rot) in apps.sorted(by: { $0.value < $1.value }) {
            add(rot, #selector(alternaIgnorar(_:)), k, marcado: config.ignorar.contains(k), em: ign)
        }
        let ignItem = NSMenuItem(title: "Nunca perguntar para…", action: nil, keyEquivalent: "")
        ignItem.submenu = ign
        pref.addItem(ignItem)
        let prefItem = NSMenuItem(title: "Preferências", action: nil, keyEquivalent: "")
        prefItem.submenu = pref
        menu.addItem(prefItem)
        add("Diagnóstico: quem usa o microfone agora", #selector(diagnostico))
        menu.addItem(.separator())
        add("Call tracking \(CT_VERSAO) — sair", #selector(sair))
    }

    @objc func abrePendente(_ s: NSMenuItem) {
        guard let id = s.representedObject as? String, let c = pendentes.first(where: { $0.id == id }) else { return }
        if popup.aberto { popup.fecha() }
        entrega([c], modo: nil)
        atualizaIcone()
    }
    @objc func enviaTodas() { popup.fecha(); entrega(pendentes, modo: "lista"); atualizaIcone() }
    @objc func descartaPendentes() { popup.fecha(); pendentes = []; armazem.salva(pendentes); atualizaIcone() }
    @objc func abreTela() { if let u = Painel.url(base: config.painel, chamadas: [], modo: nil) { Painel.abre(u, em: config.abrirEm, popup: false) } }
    /// Mandou e não chegou (outro perfil do Chrome, janela fechada cedo)? Manda de novo — o painel não duplica.
    @objc func reenvia() { if let u = Painel.url(base: config.painel, chamadas: enviadas, modo: "lista") { Painel.abre(u, em: config.abrirEm) } }
    @objc func alternaPausa() {
        if pausado { config.pausadoAte = nil } else { config.pausadoAte = Date().addingTimeInterval(3600); rastreador.descarta() }
        armazem.salva(config); atualizaIcone()
    }
    @objc func defineMinimo(_ s: NSMenuItem) {
        guard let v = s.representedObject as? Int else { return }
        config.minSeg = v; rastreador.minSeg = Double(v); armazem.salva(config)
    }
    @objc func defineAbrir(_ s: NSMenuItem) {
        guard let v = s.representedObject as? String else { return }
        config.abrirEm = v; armazem.salva(config)
    }
    @objc func alternaAbas() { config.lerAbas.toggle(); armazem.salva(config) }
    @objc func alternaSom() { config.som.toggle(); armazem.salva(config) }
    @objc func alternaLogin() { if Login.ativo { Login.desliga() } else { Login.liga(painel: config.painel) } }
    @objc func alternaIgnorar(_ s: NSMenuItem) {
        guard let k = s.representedObject as? String else { return }
        if let i = config.ignorar.firstIndex(of: k) { config.ignorar.remove(at: i) } else { config.ignorar.append(k); rastreador.descarta(chave: k) }
        armazem.salva(config)
    }
    @objc func diagnostico() {
        let a = NSAlert()
        a.messageText = "📞 Call tracking — diagnóstico"
        a.informativeText = diagnosticoTexto(detalhe: false).joined(separator: "\n")
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }
    @objc func sair() { NSApp.terminate(nil) }
}

func diagnosticoTexto(detalhe: Bool) -> [String] {
    var l = ["Dexterity Call Tracking \(CT_VERSAO) · macOS \(ProcessInfo.processInfo.operatingSystemVersionString)"]
    let (apps, fonte) = Microfone.usuarios()
    l.append("Como detecta: " + (fonte == "processos" ? "processos de áudio do macOS (sabe qual app usa o microfone)"
                                                     : "dispositivo de entrada (macOS < 14.2: supõe o app de chamada aberto)"))
    l.append(apps.isEmpty ? "Ninguém está usando o microfone agora."
                          : "Usando o microfone: " + apps.map { "\($0.rot) (\($0.bid.isEmpty ? $0.key : $0.bid))" }.joined(separator: ", "))
    if detalhe, #available(macOS 14.2, *) {
        let ps = Microfone.processos() ?? []
        l.append("Processos de áudio: \(ps.count)")
        for p in ps { l.append("  · pid \(p.pid) \(p.bid.isEmpty ? (p.nome ?? "?") : p.bid)\(p.entrada ? " 🎙" : "")") }
    }
    return l
}

// MARK: - Autoteste (--selftest)

func autoteste() -> Int32 {
    var ok = 0
    var falhas: [String] = []
    func confere(_ cond: Bool, _ nome: String) { if cond { ok += 1 } else { falhas.append(nome) } }

    // 1. catálogo
    confere(Catalogo.classifica(bid: "com.microsoft.teams2", nome: nil)?.key == "teams", "Teams novo")
    confere(Catalogo.classifica(bid: "com.microsoft.teams2.helper", nome: nil)?.key == "teams", "helper do Teams")
    confere(Catalogo.classifica(bid: "com.google.Chrome.helper", nome: nil)?.nav == true, "Chrome helper é navegador")
    confere(Catalogo.classifica(bid: "com.apple.WebKit.GPU", nome: nil)?.key == "safari", "WebKit.GPU = Safari")
    confere(Catalogo.classifica(bid: "net.whatsapp.WhatsApp", nome: nil)?.key == "whatsapp", "WhatsApp")
    confere(Catalogo.classifica(bid: "com.apple.SpeechRecognitionCore.speechrecognitiond", nome: nil) == nil, "ditado ignorado")
    confere(Catalogo.classifica(bid: CT_BUNDLE, nome: nil) == nil, "o próprio app ignorado")
    confere(["com.apple.CoreSpeech", "com.apple.cmio.ContinuityCaptureAgent", "com.apple.universalaccessd"]
        .allSatisfy { Catalogo.classifica(bid: $0, nome: nil) == nil }, "serviços do sistema que tocam o microfone")
    confere(Catalogo.classifica(bid: "", nome: "ffmpeg")?.rot == "ffmpeg", "processo sem bundle usa o nome")
    confere(Catalogo.classifica(bid: "com.exemplo.Gravador", nome: "Gravador")?.key == "com.exemplo.Gravador", "app desconhecido = bundle id")
    let prov = Catalogo.provavel(rodando: [("com.google.Chrome", true), ("com.microsoft.teams2", false)])
    confere(prov?.app.key == "teams" && prov?.app.provavel == true && prov?.frente == false, "provável prefere app de chamada ao navegador")
    confere(Catalogo.provavel(rodando: [("com.microsoft.teams2", true)])?.frente == true, "provável sabe se estava na frente")
    confere(Catalogo.provavel(rodando: [("com.apple.finder", true)]) == nil, "sem app de chamada aberto não é chamada")
    confere(Microfone.selProcessos == 0x7072_7323 && Microfone.selEntrada == 0x7069_7269, "seletores de 4 letras")
    #if compiler(>=5.10)
    if #available(macOS 14.2, *) {
        confere(Microfone.selProcessos == kAudioHardwarePropertyProcessObjectList && Microfone.selPID == kAudioProcessPropertyPID
                && Microfone.selBundle == kAudioProcessPropertyBundleID && Microfone.selEntrada == kAudioProcessPropertyIsRunningInput,
                "seletores de 4 letras = os do SDK 14.2+")
    }
    #endif

    // 2. rastreador
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    let teams = AppMic(key: "teams", rot: "Microsoft Teams", bid: "com.microsoft.teams2", nav: false)
    let chrome = AppMic(key: "chrome", rot: "Google Chrome", bid: "com.google.Chrome.helper", nav: true)
    func roda(_ r: Rastreador, de: Double, ate: Double, _ ativos: [AppMic], passo: Double = 2) -> [Chamada] {
        var fim: [Chamada] = []; var s = de
        while s <= ate { fim += r.tique(t0.addingTimeInterval(s), ativos: ativos); s += passo }
        return fim
    }
    var r = Rastreador(minSeg: 120, folgaSeg: 20)
    var fim = roda(r, de: 0, ate: 300, [teams])
    confere(fim.isEmpty && r.emCurso["teams"] != nil, "chamada em curso")
    fim += r.tique(t0.addingTimeInterval(310), ativos: [])
    confere(fim.isEmpty, "dentro da folga ainda não acabou")
    fim += r.tique(t0.addingTimeInterval(322), ativos: [])
    confere(fim.count == 1 && fim.first?.seg == 300 && r.emCurso.isEmpty, "encerra com 300 s (até o último tique visto)")
    confere(fim.first?.app == "teams" && fim.first?.ini == t0, "app e início")

    r = Rastreador(minSeg: 120, folgaSeg: 20)
    fim = roda(r, de: 0, ate: 60, [teams]) + roda(r, de: 62, ate: 120, [])
    confere(fim.isEmpty && r.emCurso.isEmpty, "chamada curta descartada")

    r = Rastreador(minSeg: 120, folgaSeg: 20)
    fim = roda(r, de: 0, ate: 200, [teams]) + roda(r, de: 202, ate: 214, []) + roda(r, de: 216, ate: 400, [teams])
    fim += roda(r, de: 402, ate: 440, [])
    confere(fim.count == 1 && fim.first?.seg == 400, "queda curta do microfone = mesma chamada")

    r = Rastreador(minSeg: 120, folgaSeg: 20)
    fim = roda(r, de: 0, ate: 48, [teams]) + roda(r, de: 50, ate: 200, [teams, chrome]) + roda(r, de: 202, ate: 250, [chrome])
    fim += roda(r, de: 252, ate: 300, [])
    confere(fim.count == 2 && Set(fim.map(\.app)) == ["teams", "chrome"], "dois apps = duas chamadas")

    r = Rastreador(minSeg: 120, folgaSeg: 20)
    fim = roda(r, de: 0, ate: 200, [teams])
    fim += r.tique(t0.addingTimeInterval(5000), ativos: [teams])
    confere(fim.count == 1 && fim.first?.seg == 200 && r.emCurso["teams"]?.ini == t0.addingTimeInterval(5000),
            "Mac dormiu: fecha no último tique e começa outra")

    r = Rastreador(minSeg: 120, folgaSeg: 20)
    _ = roda(r, de: 0, ate: 200, [chrome])
    r.anota("chrome", Abas.Achado(host: "meet.google.com", rot: "Google Meet", tit: "Daily do projeto"))
    fim = roda(r, de: 202, ate: 240, [])
    confere(fim.first?.rot == "Google Meet" && fim.first?.host == "meet.google.com" && fim.first?.tit == "Daily do projeto",
            "aba do Meet dá nome à chamada")
    _ = roda(r, de: 300, ate: 500, [teams])
    confere(r.encerraTodas().count == 1 && r.emCurso.isEmpty, "encerraTodas (sono/sair)")
    r = Rastreador(minSeg: 120, folgaSeg: 20)
    _ = roda(r, de: 0, ate: 100, [chrome])
    r.anota("chrome", Abas.Achado(host: "meet.google.com", rot: "Google Meet", tit: "Daily"))
    r.anota("chrome", Abas.Achado(host: "web.whatsapp.com", rot: "WhatsApp Web", tit: "Fulano"))
    r.anota("chrome", Abas.Achado(host: "meet.google.com", rot: "Google Meet", tit: "Daily (2)"))
    confere(r.emCurso["chrome"]?.host == "meet.google.com" && r.emCurso["chrome"]?.tit == "Daily (2)", "trocar de aba no meio não renomeia a ligação")
    _ = roda(r, de: 102, ate: 200, [teams, chrome])
    r.descarta(chave: "teams")
    confere(r.emCurso["teams"] == nil && r.emCurso["chrome"] != nil, "nunca perguntar no meio: descarta só aquele app")

    // 3. abas
    confere(Abas.casa(url: "https://meet.google.com/abc-defg-hij?authuser=0", titulo: "Meet – Daily")?.rot == "Google Meet", "Meet com código")
    confere(Abas.casa(url: "https://meet.google.com/landing", titulo: "Meet") == nil, "página inicial do Meet não é chamada")
    confere(Abas.casa(url: "https://teams.microsoft.com/v2/", titulo: "Reunião | Microsoft Teams")?.host == "teams.microsoft.com", "Teams web")
    confere(Abas.casa(url: "https://web.whatsapp.com/", titulo: "WhatsApp")?.rot == "WhatsApp Web", "WhatsApp Web")
    confere(Abas.casa(url: "https://us02web.zoom.us/wc/123/join", titulo: "Zoom")?.host == "us02web.zoom.us", "Zoom web")
    confere(Abas.casa(url: "https://zoom.us/pricing", titulo: "Zoom") == nil, "site do Zoom não é chamada")
    confere(Abas.casa(url: "https://example.com/meet.google.com", titulo: "x") == nil, "domínio no caminho não engana")
    let texto = "A\t1\thttps://www.google.com/\tGoogle\n-\t1\thttps://web.whatsapp.com/\tWhatsApp\n-\t2\thttps://meet.google.com/abc-defg-hij\tMeet – Daily\n"
    confere(Abas.melhor(texto)?.host == "meet.google.com", "várias abas: o Meet (mesmo em fundo) ganha do WhatsApp de fundo")
    confere(Abas.melhor("-\t1\thttps://teams.microsoft.com/v2/\tTeams\n") == nil, "Teams web em aba de fundo não conta")
    confere(Abas.melhor("A\t1\thttps://teams.microsoft.com/v2/\tReunião | Teams\n")?.host == "teams.microsoft.com", "Teams web na aba ativa conta")
    let duas = "-\t1\thttps://meet.google.com/aaa-bbbb-ccc\tVelha\nA\t2\thttps://us02web.zoom.us/wc/9/join\tZoom\n"
    confere(Abas.melhor(duas)?.host == "us02web.zoom.us", "aba ativa ganha da de fundo")
    confere(Abas.fonte(bid: "com.google.Chrome", safari: false).contains("active tab of w")
            && Abas.fonte(bid: "com.apple.Safari", safari: true).contains("current tab of w"), "aba ativa por navegador")
    confere(Abas.fonte(bid: "com.google.Chrome", safari: false).contains("title of t")
            && Abas.fonte(bid: "com.apple.Safari", safari: true).contains("name of t"), "AppleScript por navegador")

    // 4. painel (URL com o payload no fragmento)
    let c = Chamada(id: "c1", app: "teams", rot: "Microsoft Teams", bid: "com.microsoft.teams2",
                    ini: t0, fim: t0.addingTimeInterval(1980), tit: "Reunião — ação ✓", host: nil, provavel: nil)
    if let u = Painel.url(base: "https://jirainsight.vercel.app/", chamadas: [c], modo: "apontar") {
        let s = u.absoluteString
        confere(s.hasPrefix("https://jirainsight.vercel.app/?v=chamadas#ct="), "URL do painel")
        confere(s.hasSuffix("&m=apontar"), "modo no fragmento")
        let frag = u.fragment ?? ""
        var b64 = String(frag.dropFirst(3).prefix { $0 != "&" })
        confere(!b64.contains("+") && !b64.contains("/") && !b64.contains("="), "base64url sem + / =")
        b64 = b64.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        if let d = Data(base64Encoded: b64), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let lista = o["c"] as? [[String: Any]], let x = lista.first {
            confere(o["v"] as? Int == 1 && x["seg"] as? Int == 1980 && x["id"] as? String == "c1", "payload decodifica")
            confere((x["ini"] as? String)?.hasSuffix("Z") == true && x["tit"] as? String == "Reunião — ação ✓", "data ISO e acentos")
        } else { confere(false, "payload decodifica") }
    } else { confere(false, "URL do painel") }
    confere(Painel.url(base: "https://x.app", chamadas: [], modo: nil)?.absoluteString == "https://x.app/?v=chamadas", "URL da tela sem chamada")

    // 5. armazém e config
    let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("ct-teste-\(getpid())", isDirectory: true)
    let a = Armazem(dir: tmp)
    a.salva([c])
    confere(a.pendentes() == [c], "pendentes ida e volta")
    try? Data(#"{"minSeg":300,"ignorar":["zoom"]}"#.utf8).write(to: tmp.appendingPathComponent("config.json"))
    let cfg = a.config()
    confere(cfg.minSeg == 300 && cfg.folgaSeg == 20 && cfg.ignorar == ["zoom"] && cfg.painel == Config().painel, "config parcial usa os padrões")
    try? FileManager.default.removeItem(at: tmp)
    let velha = Chamada(id: "v", app: "x", rot: "x", bid: "", ini: t0.addingTimeInterval(-20 * 86_400),
                        fim: t0.addingTimeInterval(-20 * 86_400 + 600), tit: nil, host: nil, provavel: nil)
    confere(podaPendentes([velha, c], agora: t0.addingTimeInterval(3000)) == [c], "pendentes com mais de 14 dias saem")

    // 6. formatação e LaunchAgent
    confere(Fmt.dur(1980) == "33 min" && Fmt.dur(5400) == "1h30" && Fmt.dur(10) == "1 min", "duração")
    let pl = Login.plist(executavel: "/Users/a b/Applications/X & Y.app/Contents/MacOS/x", painel: "https://p.app")
    confere(pl.contains("X &amp; Y") && pl.contains("<string>\(CT_BUNDLE)</string>") && pl.contains("https://p.app"), "plist do login")

    print("selftest: \(ok) ok, \(falhas.count) falha(s)")
    for f in falhas { print("  ✗ " + f) }
    return falhas.isEmpty ? 0 : 1
}

// MARK: - Entrada

@main
@MainActor
enum Principal {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        if args.contains("--version") { print(CT_VERSAO); return }
        if args.contains("--selftest") { exit(autoteste()) }
        if args.contains("--probe") { diagnosticoTexto(detalhe: true).forEach { print($0) }; return }
        var demo: Double?
        if let i = args.firstIndex(of: "--demo") { demo = i + 1 < args.count ? (Double(args[i + 1]) ?? 8) : 8 }
        // Uma instância só (o LaunchAgent e um duplo-clique não podem rodar dois detectores).
        if demo == nil, Bundle.main.bundleIdentifier == CT_BUNDLE,
           NSRunningApplication.runningApplications(withBundleIdentifier: CT_BUNDLE).count > 1 { return }
        let app = NSApplication.shared
        let agente = Agente(demo: demo)
        app.delegate = agente
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(agente) { app.run() }
    }
}
