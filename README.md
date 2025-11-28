# Inelastic Housing Growth Model

An interactive Overlapping Generations (OLG) model that simulates how housing supply constraints affect generational wealth, inequality, and affordability over time.

Built with **React**, **TypeScript**, and **Tailwind CSS**.

## 🏠 Model Overview

This project visualizes a stylized economic model where housing supply is inelastic (or grows slowly) relative to population and technology. It demonstrates how this constraint acts as a mechanism for wealth transfer and inequality between generations.

### Core Economic Assumptions
- **Generations:** Agents live for two periods: **Young** (working, saving, buying house) and **Old** (retired, selling house, consuming savings).
- **Income:** Young agents draw productivity from a Log-Normal distribution `ln(a) ~ N(0, σ²)`.
- **Housing Supply:** Perfectly inelastic or grows at a fixed rate $g_H$.
- **Allocation:** Housing is allocated via a **Second-Price Auction**. The top $H_t$ bidders (sorted by Willingness-To-Pay) become homeowners.
- **Price Determination:** The market price $P_t$ is determined by the **marginal buyer** (the $H_t$-th highest bidder).
- **Utility:** Agents maximize `U = log(c_young) + β * log(c_old) + (1 if owner)`.

### Key Dynamics
1.  **Scarcity:** If $g_H < g_{Pop}$, housing becomes relatively scarcer over time.
2.  **Price Explosion:** As scarcity rises and technology (income) grows, the marginal buyer's willingness to pay increases, driving up $P_t$.
3.  **Wealth Transfer:** Early generations buy at low prices and sell at high prices to the larger, richer next generation. This generates massive capital gains for the old, paid for by the young.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/inelastic-housing-growth.git
    cd inelastic-housing-growth
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🎛️ Interactive Parameters

The web interface allows you to tweak the following structural parameters in real-time:

| Parameter | Symbol | Description |
| :--- | :---: | :--- |
| **Pop. Growth Rate** | $g_N$ | Rate at which the population size increases per generation. |
| **Tech Growth Rate** | $g_A$ | Rate at which productivity (and thus average income) grows. |
| **Inequality** | $\sigma$ | Standard deviation of log-income. Controls the gap between rich and poor. |
| **Discount Factor** | $\beta$ | Measure of patience. Higher $\beta$ means agents care more about old-age consumption. |
| **Housing Growth Rate** | $g_H$ | Rate at which new housing stock is added. |
| **Initial Conditions** | $N_0, H_0, A_0$ | Starting values for population, housing stock, and technology. |

## 🛠️ Tech Stack

-   **Frontend:** React 19 (Vite)
-   **Styling:** Tailwind CSS v4
-   **Icons:** Lucide React
-   **Language:** TypeScript

## 📄 License

MIT License
