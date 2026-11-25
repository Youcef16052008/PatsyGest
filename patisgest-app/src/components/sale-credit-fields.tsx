"use client";

export default function SaleCreditFields({
  creditNom,
  creditTelephone,
  creditType,
  onChangeNom,
  onChangeTelephone,
  onChangeType,
}: {
  creditNom: string;
  creditTelephone: string;
  creditType: "particulier" | "cafe_entreprise";
  onChangeNom: (v: string) => void;
  onChangeTelephone: (v: string) => void;
  onChangeType: (v: "particulier" | "cafe_entreprise") => void;
}) {
  return (
    <div className="mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-3" style={{ background: "var(--pg-subtle)" }}>
      <input type="hidden" name="creditMode" value="1" />
      <label className="pg-field">
        Nom du client / Café *
        <input
          type="text"
          name="creditNom"
          required
          placeholder="Ex : Café El Bahdja"
          value={creditNom}
          onChange={(e) => onChangeNom(e.target.value)}
          className="pg-input"
        />
      </label>
      <label className="pg-field">
        Téléphone WhatsApp
        <input
          type="tel"
          name="creditTelephone"
          placeholder="0550 00 00 00"
          value={creditTelephone}
          onChange={(e) => onChangeTelephone(e.target.value)}
          className="pg-input"
        />
      </label>
      <label className="pg-field">
        Type
        <select
          name="creditType"
          value={creditType}
          onChange={(e) => onChangeType(e.target.value === "cafe_entreprise" ? "cafe_entreprise" : "particulier")}
          className="pg-input"
        >
          <option value="particulier">Client régulier</option>
          <option value="cafe_entreprise">Café / Entreprise</option>
        </select>
      </label>
    </div>
  );
}
