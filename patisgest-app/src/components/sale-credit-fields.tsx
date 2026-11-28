"use client";

import { useLocale } from "./locale-provider";

/** Seulement le nécessaire pour retrouver le client qui doit payer. */
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
  const { t } = useLocale();
  return (
    <div className="pg-credit-fields">
      <input type="hidden" name="creditMode" value="1" />
      <label className="pg-field">
        {t.posCreditName}
        <input
          type="text"
          name="creditNom"
          required
          placeholder="Café El Bahdja"
          value={creditNom}
          onChange={(e) => onChangeNom(e.target.value)}
          className="pg-input"
        />
      </label>
      <label className="pg-field">
        {t.posCreditPhone}
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
        {t.posCreditType}
        <select
          name="creditType"
          value={creditType}
          onChange={(e) => onChangeType(e.target.value === "cafe_entreprise" ? "cafe_entreprise" : "particulier")}
          className="pg-input"
        >
          <option value="particulier">{t.posCreditRegular}</option>
          <option value="cafe_entreprise">{t.posCreditCafe}</option>
        </select>
      </label>
    </div>
  );
}
