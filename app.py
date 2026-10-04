import streamlit as st
import pandas as pd
import plotly.express as px

# 1. Sayfa Ayarları
st.set_page_config(page_title="Küresel Ekonomi ve Yaşam Laboratuvarı", page_icon="🌍", layout="wide")
st.title("🌍 Küresel Alım Gücü, Yaşam Maliyeti ve Makroekonomik Veri Laboratuvarı")

# 2. Veriyi Yükleme ve Zenginleştirme
@st.cache_data
def veri_yukle():
    df = pd.read_csv('final_ekonomi_verisi.csv')
    df['kira_alim_gucu_skoru'] = df['minimum_wage'] / df['rent_index']
    df['market_alim_gucu_skoru'] = df['minimum_wage'] / df['groceries_index']
    return df

df = veri_yukle()

# 3. Yan Menü (Sidebar) - Filtreler ve Simülatör
st.sidebar.header("⚙️ Kontrol Paneli")
varsayilan_ulkeler = ['Turkey', 'United States', 'Germany', 'Switzerland', 'Greece', 'United Kingdom', 'Poland']

secilen_ulkeler = st.sidebar.multiselect(
    "Kıyaslamak istediğiniz ülkeleri seçin:",
    options=df['country'].unique(),
    default=varsayilan_ulkeler
)

st.sidebar.markdown("---")
st.sidebar.header("🎯 Kendi Bütçeni Test Et")
kullanici_butcesi = st.sidebar.slider(
    "Aylık Bütçeniz (USD):", 
    min_value=500, 
    max_value=10000, 
    value=2000, 
    step=100
)
st.sidebar.info(f"Seçilen Bütçe: **${kullanici_butcesi}**")

if not secilen_ulkeler:
    st.warning("⚠️ Lütfen sol menüden en az bir ülke seçin.")
else:
    df_secilen = df[df['country'].isin(secilen_ulkeler)].copy()
    
    # 4. PROFESYONEL SEKMELER (24 Kararlı ve Hatasız Altın Standart Sekme)
    tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8, tab9, tab10, tab11, tab12, tab13, tab14, tab15, tab16, tab17, tab18, tab19, tab20, tab21, tab22, tab23, tab24 = st.tabs([
        "🏠 Kira Alım Gücü", 
        "🛒 Market Alım Gücü", 
        "🎯 Bütçe Simülatörü", 
        "💰 Asgari Ücret", 
        "📊 Yaşam Maliyeti",
        "🏙️ Yaşam + Kira",
        "🍽️ Restoran Fiyatları",
        "💵 GSYH (Milli Gelir)",
        "📈 Enflasyon (CPI)",
        "👷 İşgücüne Katılım",
        "💸 Vergi Gelirleri",
        "🌆 Kentleşme (Kent Nüfusu)",
        "📚 İlköğretim Oranı",
        "❤️ Yaşam Beklentisi",
        "🧾 Toplam Vergi",
        "🩺 Doktor Sayısı",
        "💊 Cepten Sağlık",
        "👼 Bebek Ölüm",
        "💼 İşsizlik", 
        "⛽ Benzin Fiyatı",
        "👶 Doğum Oranı",
        "⚔️ Askeri Personel",
        "🌐 Coğrafi Konum",
        "📋 Veri Tablosu"
    ])
    
    with tab1:
        st.subheader("Seçilen Ülkelerin Kira Ödeyebilme Skoru")
        df_kira = df_secilen.sort_values(by='kira_alim_gucu_skoru', ascending=False)
        fig_kira = px.bar(df_kira, x='country', y='kira_alim_gucu_skoru', text_auto='.2f', color='kira_alim_gucu_skoru', color_continuous_scale='RdYlGn')
        fig_kira.update_layout(template='plotly_white')
        st.plotly_chart(fig_kira, use_container_width=True)

    with tab2:
        st.subheader("Seçilen Ülkelerin Market (Gıda) Alım Gücü Skoru")
        df_market = df_secilen.sort_values(by='market_alim_gucu_skoru', ascending=False)
        fig_market = px.bar(df_market, x='country', y='market_alim_gucu_skoru', text_auto='.2f', color='market_alim_gucu_skoru', color_continuous_scale='Blues')
        fig_market.update_layout(template='plotly_white')
        st.plotly_chart(fig_market, use_container_width=True)

    with tab3:
        st.subheader(f"Girdiğiniz ${kullanici_butcesi} Bütçe ile Hangi Ülkede Kral/Kraliçesiniz?")
        df_secilen['zenginlik_skoru'] = kullanici_butcesi / df_secilen['minimum_wage']
        df_sim = df_secilen.sort_values(by='zenginlik_skoru', ascending=False)
        
        fig_sim = px.bar(
            df_sim, x='country', y='zenginlik_skoru', text_auto='.1f',
            labels={'country': 'Ülkeler', 'zenginlik_skoru': 'Asgari Ücretin Kaç Katı?'},
            color='zenginlik_skoru', color_continuous_scale='Purples'
        )
        fig_sim.update_layout(template='plotly_white')
        st.plotly_chart(fig_sim, use_container_width=True)

    with tab4:
        st.subheader("💰 Ülkelere Göre Net Asgari Ücret (USD)")
        df_mw = df_secilen.sort_values(by='minimum_wage', ascending=False)
        fig_mw = px.bar(df_mw, x='country', y='minimum_wage', text_auto='.0f', color='minimum_wage', color_continuous_scale='Greens')
        fig_mw.update_layout(template='plotly_white')
        st.plotly_chart(fig_mw, use_container_width=True)

    with tab5:
        st.subheader("📊 Ülkelere Göre Yaşam Maliyeti Endeksi")
        df_col = df_secilen.sort_values(by='cost_of_living_index', ascending=False)
        fig_col = px.bar(df_col, x='country', y='cost_of_living_index', text_auto='.1f', color='cost_of_living_index', color_continuous_scale='Oranges')
        fig_col.update_layout(template='plotly_white')
        st.plotly_chart(fig_col, use_container_width=True)

    with tab6:
        st.subheader("🏙️ Yaşam Maliyeti + Kira Dahil Toplam Endeks")
        df_clpr = df_secilen.sort_values(by='cost_of_living_plus_rent_index', ascending=False)
        fig_clpr = px.bar(df_clpr, x='country', y='cost_of_living_plus_rent_index', text_auto='.1f', color='cost_of_living_plus_rent_index', color_continuous_scale='Sunset')
        fig_clpr.update_layout(template='plotly_white')
        st.plotly_chart(fig_clpr, use_container_width=True)

    with tab7:
        st.subheader("🍽️ Ülkelere Göre Restoran Fiyat Endeksi")
        df_rest = df_secilen.sort_values(by='restaurant_price_index', ascending=False)
        fig_rest = px.bar(df_rest, x='country', y='restaurant_price_index', text_auto='.1f', labels={'restaurant_price_index': 'Restoran Endeksi'}, color='restaurant_price_index', color_continuous_scale='YlOrRd')
        fig_rest.update_layout(template='plotly_white')
        st.plotly_chart(fig_rest, use_container_width=True)

    with tab8:
        st.subheader("💵 Ülkelere Göre GSYH (Milli Gelir - USD)")
        df_gdp = df_secilen.sort_values(by='gdp', ascending=False)
        fig_gdp = px.bar(df_gdp, x='country', y='gdp', text_auto='.2s', labels={'gdp': 'GSYH ($)'}, color='gdp', color_continuous_scale='Viridis')
        fig_gdp.update_layout(template='plotly_white')
        st.plotly_chart(fig_gdp, use_container_width=True)

    with tab9:
        st.subheader("📈 Ülkelere Göre Enflasyon / Tüketici Fiyat Endeksi Değişimi (%)")
        df_cpi = df_secilen.sort_values(by='cpi_change_(%)', ascending=False)
        fig_cpi = px.bar(df_cpi, x='country', y='cpi_change_(%)', text_auto='.1f', labels={'cpi_change_(%)': 'CPI Değişim (%)'}, color='cpi_change_(%)', color_continuous_scale='Reds')
        fig_cpi.update_layout(template='plotly_white')
        st.plotly_chart(fig_cpi, use_container_width=True)

    with tab10:
        st.subheader("👷 Ülkelere Göre İşgücüne Katılım Oranı (%)")
        df_lf = df_secilen.sort_values(by='population:_labor_force_participation_(%)', ascending=False)
        fig_lf = px.bar(df_lf, x='country', y='population:_labor_force_participation_(%)', text_auto='.1f', labels={'population:_labor_force_participation_(%)': 'İşgücüne Katılım (%)'}, color='population:_labor_force_participation_(%)', color_continuous_scale='Teal')
        fig_lf.update_layout(template='plotly_white')
        st.plotly_chart(fig_lf, use_container_width=True)

    with tab11:
        st.subheader("💸 Ülkelere Göre Vergi Gelirleri Oranı (%)")
        df_tr = df_secilen.sort_values(by='tax_revenue_(%)', ascending=False)
        fig_tr = px.bar(df_tr, x='country', y='tax_revenue_(%)', text_auto='.1f', labels={'tax_revenue_(%)': 'Vergi Gelirleri (%)'}, color='tax_revenue_(%)', color_continuous_scale='Purples')
        fig_tr.update_layout(template='plotly_white')
        st.plotly_chart(fig_tr, use_container_width=True)

    with tab12:
        st.subheader("🌆 Ülkelere Göre Şehir Nüfusu (Kentleşme)")
        df_urban = df_secilen.sort_values(by='urban_population', ascending=False)
        fig_urban = px.bar(df_urban, x='country', y='urban_population', text_auto='.2s', labels={'urban_population': 'Kent Nüfusu'}, color='urban_population', color_continuous_scale='Blues')
        fig_urban.update_layout(template='plotly_white')
        st.plotly_chart(fig_urban, use_container_width=True)

    with tab13:
        st.subheader("📚 Ülkelere Göre İlköğretim Okullaşma Oranı (%)")
        df_prim = df_secilen.sort_values(by='gross_primary_education_enrollment_(%)', ascending=False)
        fig_prim = px.bar(df_prim, x='country', y='gross_primary_education_enrollment_(%)', text_auto='.1f', labels={'gross_primary_education_enrollment_(%)': 'İlköğretim Oranı (%)'}, color='gross_primary_education_enrollment_(%)', color_continuous_scale='Greens')
        fig_prim.update_layout(template='plotly_white')
        st.plotly_chart(fig_prim, use_container_width=True)

    with tab14:
        st.subheader("❤️ Ülkelere Göre Ortalama Yaşam Beklentisi (Yıl)")
        df_life = df_secilen.sort_values(by='life_expectancy', ascending=False)
        fig_life = px.bar(df_life, x='country', y='life_expectancy', text_auto='.1f', color='life_expectancy', color_continuous_scale='Greens')
        fig_life.update_layout(template='plotly_white')
        st.plotly_chart(fig_life, use_container_width=True)

    with tab15:
        st.subheader("🧾 Ülkelere Göre Toplam Vergi Oranı (%)")
        df_tax = df_secilen.sort_values(by='total_tax_rate', ascending=False)
        fig_tax = px.bar(df_tax, x='country', y='total_tax_rate', text_auto='.1f', labels={'total_tax_rate': 'Toplam Vergi (%)'}, color='total_tax_rate', color_continuous_scale='Reds')
        fig_tax.update_layout(template='plotly_white')
        st.plotly_chart(fig_tax, use_container_width=True)

    with tab16:
        st.subheader("🩺 Bin Kişi Başına Düşen Doktor Sayısı")
        df_doc = df_secilen.sort_values(by='physicians_per_thousand', ascending=False)
        fig_doc = px.bar(df_doc, x='country', y='physicians_per_thousand', text_auto='.2f', labels={'physicians_per_thousand': 'Doktor Sayısı'}, color='physicians_per_thousand', color_continuous_scale='Teal')
        fig_doc.update_layout(template='plotly_white')
        st.plotly_chart(fig_doc, use_container_width=True)

    with tab17:
        st.subheader("💊 Ülkelere Göre Cep Yakan Sağlık Harcamaları (%)")
        df_oop = df_secilen.sort_values(by='out_of_pocket_health_expenditure', ascending=False)
        fig_oop = px.bar(df_oop, x='country', y='out_of_pocket_health_expenditure', text_auto='.1f', labels={'out_of_pocket_health_expenditure': 'Cepten Sağlık (%)'}, color='out_of_pocket_health_expenditure', color_continuous_scale='OrRd')
        fig_oop.update_layout(template='plotly_white')
        st.plotly_chart(fig_oop, use_container_width=True)

    with tab18:
        st.subheader("👼 Ülkelere Göre Bebek Ölüm Oranı")
        df_inf = df_secilen.sort_values(by='infant_mortality', ascending=False)
        fig_inf = px.bar(df_inf, x='country', y='infant_mortality', text_auto='.1f', labels={'infant_mortality': 'Bebek Ölüm Oranı'}, color='infant_mortality', color_continuous_scale='Reds')
        fig_inf.update_layout(template='plotly_white')
        st.plotly_chart(fig_inf, use_container_width=True)

    with tab19:
        st.subheader("💼 Ülkelere Göre İşsizlik Oranı (%)")
        df_unemp = df_secilen.sort_values(by='unemployment_rate', ascending=True)
        fig_unemp = px.bar(df_unemp, x='country', y='unemployment_rate', text_auto='.1f', color='unemployment_rate', color_continuous_scale='Reds')
        fig_unemp.update_layout(template='plotly_white')
        st.plotly_chart(fig_unemp, use_container_width=True)

    with tab20:
        st.subheader("⛽ Ülkelere Göre Akaryakıt (Benzin) Fiyatları (USD)")
        df_gas = df_secilen.sort_values(by='gasoline_price', ascending=False)
        fig_gas = px.bar(df_gas, x='country', y='gasoline_price', text_auto='.2f', labels={'gasoline_price': 'Benzin ($)'}, color='gasoline_price', color_continuous_scale='Oranges')
        fig_gas.update_layout(template='plotly_white')
        st.plotly_chart(fig_gas, use_container_width=True)

    with tab21:
        st.subheader("👶 Ülkelere Göre Doğum Oranı")
        df_birth = df_secilen.sort_values(by='birth_rate', ascending=False)
        fig_birth = px.bar(df_birth, x='country', y='birth_rate', text_auto='.2f', labels={'birth_rate': 'Doğum Oranı'}, color='birth_rate', color_continuous_scale='Teal')
        fig_birth.update_layout(template='plotly_white')
        st.plotly_chart(fig_birth, use_container_width=True)

    with tab22:
        st.subheader("⚔️ Ülkelere Göre Aktif Askeri Personel Sayısı")
        df_arm = df_secilen.sort_values(by='armed_forces_size', ascending=False)
        fig_arm = px.bar(df_arm, x='country', y='armed_forces_size', text_auto='.2s', labels={'armed_forces_size': 'Askeri Personel'}, color='armed_forces_size', color_continuous_scale='Blues')
        fig_arm.update_layout(template='plotly_white')
        st.plotly_chart(fig_arm, use_container_width=True)

    with tab23:
        st.subheader("🌐 Ülkelerin Coğrafi Enlem (Latitude) Dağılımı")
        df_lat = df_secilen.sort_values(by='latitude', ascending=False)
        fig_lat = px.bar(df_lat, x='country', y='latitude', text_auto='.1f', labels={'latitude': 'Enlem Değeri'}, color='latitude', color_continuous_scale='Viridis')
        fig_lat.update_layout(template='plotly_white')
        st.plotly_chart(fig_lat, use_container_width=True)

    with tab24:
        st.subheader("Detaylı Kapsamlı Analiz ve Veri Tablosu")
        st.dataframe(df_secilen[['rank', 'country', 'minimum_wage', 'gdp', 'physicians_per_thousand', 'urban_population', 'gross_primary_education_enrollment_(%)', 'kira_alim_gucu_skoru']], use_container_width=True)