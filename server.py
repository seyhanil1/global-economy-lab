"""
Küresel Ekonomi ve Yaşam Laboratuvarı — Flask backend.

Bu dosya `app.py` (Streamlit sürümü) içindeki hesaplama mekaniğini DEĞİŞTİRMEDEN
aynen uygular ve sonuçları JSON API olarak sunar:

    kira_alim_gucu_skoru   = minimum_wage / rent_index
    market_alim_gucu_skoru = minimum_wage / groceries_index
    zenginlik_skoru        = kullanici_butcesi / minimum_wage

Her metrik `app.py`'deki ilgili sekmeyle aynı sütunu, aynı sıralama yönünü ve
aynı sayı formatını kullanır. `app.py` doğrudan import edilmez; çünkü import
edildiği anda Streamlit arayüz kodu da çalışır.

Çalıştırma:
    python server.py            ->  http://127.0.0.1:5000
"""

from __future__ import annotations

import math
import os
from functools import lru_cache
from pathlib import Path

import pandas as pd
from flask import Flask, abort, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "final_ekonomi_verisi.csv"
STATIC_DIR = BASE_DIR / "static"

# --- app.py ile aynı sabitler -------------------------------------------------
VARSAYILAN_ULKELER = [
    "Turkey", "United States", "Germany", "Switzerland",
    "Greece", "United Kingdom", "Poland",
]
BUTCE = {"min": 500, "max": 10000, "value": 2000, "step": 100}

TABLO_SUTUNLARI = [
    "rank", "country", "minimum_wage", "gdp", "physicians_per_thousand",
    "urban_population", "gross_primary_education_enrollment_(%)",
    "kira_alim_gucu_skoru",
]

# --- 24 sekmenin birebir karşılığı ---------------------------------------------
# id, sekme adı, başlık (st.subheader), sütun, format (text_auto), renk skalası,
# artan sıralama mı?, birim, kategori
METRIKLER = [
    dict(id="kira", sekme="Kira Alım Gücü", baslik="Seçilen Ülkelerin Kira Ödeyebilme Skoru",
         sutun="kira_alim_gucu_skoru", format=".2f", skala="RdYlGn", artan=False, birim="",
         kategori="Alım Gücü", aciklama="Asgari ücret / kira endeksi. Yüksek değer, asgari ücretle kiraya daha kolay erişim demektir."),
    dict(id="market", sekme="Market Alım Gücü", baslik="Seçilen Ülkelerin Market (Gıda) Alım Gücü Skoru",
         sutun="market_alim_gucu_skoru", format=".2f", skala="Blues", artan=False, birim="",
         kategori="Alım Gücü", aciklama="Asgari ücret / market (gıda) endeksi."),
    dict(id="butce", sekme="Bütçe Simülatörü", baslik="Girdiğiniz ${butce} Bütçe ile Hangi Ülkede Kral/Kraliçesiniz?",
         sutun="zenginlik_skoru", format=".1f", skala="Purples", artan=False, birim="×",
         kategori="Alım Gücü", etiket="Asgari Ücretin Kaç Katı?",
         aciklama="Bütçeniz / ülkenin asgari ücreti. Bütçenizin yerel asgari ücretin kaç katı olduğunu gösterir."),
    dict(id="asgari", sekme="Asgari Ücret", baslik="Ülkelere Göre Net Asgari Ücret (USD)",
         sutun="minimum_wage", format=".0f", skala="Greens", artan=False, birim="$",
         kategori="Fiyatlar & Ücretler", aciklama="Veri setindeki minimum_wage sütunu (USD). Değerler saatlik asgari ücrete karşılık gelir (ör. ABD 7,25 $)."),
    dict(id="yasam", sekme="Yaşam Maliyeti", baslik="Ülkelere Göre Yaşam Maliyeti Endeksi",
         sutun="cost_of_living_index", format=".1f", skala="Oranges", artan=False, birim="",
         kategori="Fiyatlar & Ücretler", aciklama="Kira hariç tüketim fiyatları endeksi."),
    dict(id="yasam-kira", sekme="Yaşam + Kira", baslik="Yaşam Maliyeti + Kira Dahil Toplam Endeks",
         sutun="cost_of_living_plus_rent_index", format=".1f", skala="Sunset", artan=False, birim="",
         kategori="Fiyatlar & Ücretler", aciklama="Kira dahil toplam yaşam maliyeti endeksi."),
    dict(id="restoran", sekme="Restoran Fiyatları", baslik="Ülkelere Göre Restoran Fiyat Endeksi",
         sutun="restaurant_price_index", format=".1f", skala="YlOrRd", artan=False, birim="",
         kategori="Fiyatlar & Ücretler", etiket="Restoran Endeksi", aciklama="Restoran ve kafe fiyatları endeksi."),
    dict(id="gsyh", sekme="GSYH (Milli Gelir)", baslik="Ülkelere Göre GSYH (Milli Gelir - USD)",
         sutun="gdp", format=".2s", skala="Viridis", artan=False, birim="$",
         kategori="Makroekonomi", etiket="GSYH ($)", aciklama="Gayri safi yurt içi hasıla (cari USD)."),
    dict(id="enflasyon", sekme="Enflasyon (CPI)", baslik="Ülkelere Göre Enflasyon / Tüketici Fiyat Endeksi Değişimi (%)",
         sutun="cpi_change_(%)", format=".1f", skala="Reds", artan=False, birim="%",
         kategori="Makroekonomi", etiket="CPI Değişim (%)", aciklama="Tüketici fiyat endeksindeki yıllık değişim."),
    dict(id="isgucu", sekme="İşgücüne Katılım", baslik="Ülkelere Göre İşgücüne Katılım Oranı (%)",
         sutun="population:_labor_force_participation_(%)", format=".1f", skala="Teal", artan=False, birim="%",
         kategori="Makroekonomi", etiket="İşgücüne Katılım (%)", aciklama="Çalışma çağındaki nüfus içinde işgücüne katılanların oranı."),
    dict(id="vergi-gelir", sekme="Vergi Gelirleri", baslik="Ülkelere Göre Vergi Gelirleri Oranı (%)",
         sutun="tax_revenue_(%)", format=".1f", skala="Purples", artan=False, birim="%",
         kategori="Makroekonomi", etiket="Vergi Gelirleri (%)", aciklama="Vergi gelirlerinin GSYH'ye oranı."),
    dict(id="kentlesme", sekme="Kentleşme", baslik="Ülkelere Göre Şehir Nüfusu (Kentleşme)",
         sutun="urban_population", format=".2s", skala="Blues", artan=False, birim="",
         kategori="Toplum & Sağlık", etiket="Kent Nüfusu", aciklama="Kentlerde yaşayan toplam nüfus."),
    dict(id="ilkogretim", sekme="İlköğretim Oranı", baslik="Ülkelere Göre İlköğretim Okullaşma Oranı (%)",
         sutun="gross_primary_education_enrollment_(%)", format=".1f", skala="Greens", artan=False, birim="%",
         kategori="Toplum & Sağlık", etiket="İlköğretim Oranı (%)", aciklama="Brüt ilköğretim okullaşma oranı (100'ü aşabilir)."),
    dict(id="yasam-beklentisi", sekme="Yaşam Beklentisi", baslik="Ülkelere Göre Ortalama Yaşam Beklentisi (Yıl)",
         sutun="life_expectancy", format=".1f", skala="Greens", artan=False, birim="yıl",
         kategori="Toplum & Sağlık", aciklama="Doğumda beklenen ortalama yaşam süresi."),
    dict(id="toplam-vergi", sekme="Toplam Vergi", baslik="Ülkelere Göre Toplam Vergi Oranı (%)",
         sutun="total_tax_rate", format=".1f", skala="Reds", artan=False, birim="%",
         kategori="Makroekonomi", etiket="Toplam Vergi (%)", aciklama="İşletmelerin ödediği toplam vergi ve katkıların kâra oranı."),
    dict(id="doktor", sekme="Doktor Sayısı", baslik="Bin Kişi Başına Düşen Doktor Sayısı",
         sutun="physicians_per_thousand", format=".2f", skala="Teal", artan=False, birim="",
         kategori="Toplum & Sağlık", etiket="Doktor Sayısı", aciklama="Her 1.000 kişiye düşen hekim sayısı."),
    dict(id="cepten-saglik", sekme="Cepten Sağlık", baslik="Ülkelere Göre Cep Yakan Sağlık Harcamaları (%)",
         sutun="out_of_pocket_health_expenditure", format=".1f", skala="OrRd", artan=False, birim="%",
         kategori="Toplum & Sağlık", etiket="Cepten Sağlık (%)", aciklama="Sağlık harcamalarının hanelerce doğrudan ödenen payı."),
    dict(id="bebek-olum", sekme="Bebek Ölüm", baslik="Ülkelere Göre Bebek Ölüm Oranı",
         sutun="infant_mortality", format=".1f", skala="Reds", artan=False, birim="‰",
         kategori="Toplum & Sağlık", etiket="Bebek Ölüm Oranı", aciklama="1.000 canlı doğumda bir yaşından önce ölen bebek sayısı."),
    dict(id="issizlik", sekme="İşsizlik", baslik="Ülkelere Göre İşsizlik Oranı (%)",
         sutun="unemployment_rate", format=".1f", skala="Reds", artan=True, birim="%",
         kategori="Makroekonomi", aciklama="İşgücü içindeki işsizlerin oranı (düşükten yükseğe sıralı)."),
    dict(id="benzin", sekme="Benzin Fiyatı", baslik="Ülkelere Göre Akaryakıt (Benzin) Fiyatları (USD)",
         sutun="gasoline_price", format=".2f", skala="Oranges", artan=False, birim="$",
         kategori="Fiyatlar & Ücretler", etiket="Benzin ($)", aciklama="Litre başına benzin fiyatı (USD)."),
    dict(id="dogum", sekme="Doğum Oranı", baslik="Ülkelere Göre Doğum Oranı",
         sutun="birth_rate", format=".2f", skala="Teal", artan=False, birim="‰",
         kategori="Toplum & Sağlık", etiket="Doğum Oranı", aciklama="1.000 kişi başına yıllık canlı doğum."),
    dict(id="askeri", sekme="Askeri Personel", baslik="Ülkelere Göre Aktif Askeri Personel Sayısı",
         sutun="armed_forces_size", format=".2s", skala="Blues", artan=False, birim="",
         kategori="Coğrafya & Güvenlik", etiket="Askeri Personel", aciklama="Aktif silahlı kuvvetler personeli."),
    dict(id="enlem", sekme="Coğrafi Konum", baslik="Ülkelerin Coğrafi Enlem (Latitude) Dağılımı",
         sutun="latitude", format=".1f", skala="Viridis", artan=False, birim="°",
         kategori="Coğrafya & Güvenlik", etiket="Enlem Değeri", aciklama="Ülkenin coğrafi merkezinin enlemi (negatif: güney yarımküre)."),
]
METRIK_SOZLUK = {m["id"]: m for m in METRIKLER}

# CSV'de "$1,234 ", "38.40%" gibi metin olarak gelen ama sayısal olan sütunlar.
SAYISAL_SUTUNLAR = sorted(
    {m["sutun"] for m in METRIKLER if m["sutun"] != "zenginlik_skoru"} | set(TABLO_SUTUNLARI) - {"country"}
)


# --- Veri katmanı ---------------------------------------------------------------
def veri_yukle() -> pd.DataFrame:
    """app.py'deki veri_yukle() ile aynı."""
    df = pd.read_csv(CSV_PATH)
    df["kira_alim_gucu_skoru"] = df["minimum_wage"] / df["rent_index"]
    df["market_alim_gucu_skoru"] = df["minimum_wage"] / df["groceries_index"]
    return df


def _sayiya_cevir(seri: pd.Series) -> pd.Series:
    """'$703,082,435,360 ' / '4.58%' / '21,000' -> float. Sayısal sütunlara dokunmaz."""
    if pd.api.types.is_numeric_dtype(seri):
        return seri
    temiz = seri.astype("string").str.replace(r"[\$,%\s]", "", regex=True)
    return pd.to_numeric(temiz, errors="coerce")


@lru_cache(maxsize=1)
def veri() -> pd.DataFrame:
    """Uygulama ömrü boyunca önbelleklenen (st.cache_data karşılığı), API için temizlenmiş veri."""
    df = veri_yukle()
    for sutun in SAYISAL_SUTUNLAR:
        if sutun in df.columns:
            df[sutun] = _sayiya_cevir(df[sutun])
    return df


def _json_deger(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):  # numpy skalerleri
        v = v.item()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
    return v


def _secilen_ulkeler() -> list[str]:
    ham = request.args.get("countries", "")
    return [u.strip() for u in ham.split("|") if u.strip()]


def _butce() -> int:
    try:
        butce = int(float(request.args.get("budget", BUTCE["value"])))
    except ValueError:
        abort(400, description="Geçersiz bütçe değeri.")
    return max(BUTCE["min"], min(BUTCE["max"], butce))


# --- Flask --------------------------------------------------------------------
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.json.ensure_ascii = False
app.json.sort_keys = False


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/meta")
def meta():
    df = veri()
    return jsonify(
        ulkeler=sorted(df["country"].dropna().unique().tolist()),
        varsayilan_ulkeler=VARSAYILAN_ULKELER,
        butce=BUTCE,
        metrikler=[{k: v for k, v in m.items()} for m in METRIKLER],
        toplam_ulke=int(df["country"].nunique()),
    )


@app.get("/api/metric/<metrik_id>")
def metrik(metrik_id: str):
    m = METRIK_SOZLUK.get(metrik_id)
    if m is None:
        abort(404, description="Böyle bir metrik yok.")

    secilen = _secilen_ulkeler()
    df_secilen = veri()[veri()["country"].isin(secilen)].copy()

    baslik = m["baslik"]
    if m["id"] == "butce":
        butce = _butce()
        df_secilen["zenginlik_skoru"] = butce / df_secilen["minimum_wage"]
        baslik = baslik.replace("{butce}", str(butce))

    df_sirali = df_secilen.sort_values(by=m["sutun"], ascending=m["artan"])
    satirlar = [
        {"country": r["country"], "value": _json_deger(r[m["sutun"]])}
        for _, r in df_sirali.iterrows()
    ]
    return jsonify(metrik={**m, "baslik": baslik}, satirlar=satirlar)


@app.get("/api/table")
def tablo():
    secilen = _secilen_ulkeler()
    df_secilen = veri()[veri()["country"].isin(secilen)]
    satirlar = [
        {k: _json_deger(v) for k, v in kayit.items()}
        for kayit in df_secilen[TABLO_SUTUNLARI].to_dict(orient="records")
    ]
    return jsonify(sutunlar=TABLO_SUTUNLARI, satirlar=satirlar)


@app.errorhandler(400)
@app.errorhandler(404)
def hata(e):
    if request.path.startswith("/api/"):
        return jsonify(hata=getattr(e, "description", str(e))), e.code
    return e


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print(f"\n  Ekonomi Laboratuvarı çalışıyor:  http://127.0.0.1:{port}\n")
    app.run(host="127.0.0.1", port=port, debug=debug)
